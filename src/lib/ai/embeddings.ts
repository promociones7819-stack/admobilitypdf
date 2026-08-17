// Embedding Layer — dos proveedores intercambiables:
//  1. `transformersEmbedder`: MiniLM real ejecutado en un Web Worker (WASM/WebGPU).
//  2. `hashEmbedder`: respaldo 100% offline (hashing léxico), sin descargas.
// Ambos cumplen EmbeddingProvider, así que la capa superior no cambia.
import type { EmbeddingProvider } from "./types";

const DIMS = 384;

// --------------------------------------------------------- respaldo offline
const STOP = new Set([
  "de","la","el","los","las","un","una","y","o","que","en","del","al","a","con","por","para",
  "se","su","sus","es","son","lo","como","más","the","of","and","to","in","for","on","is","are",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9ñ]+/)
    .filter((token) => token.length > 2 && !STOP.has(token));
}

function hash(value: string, seed: number): number {
  let h = seed ^ 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function hashVector(text: string): Float32Array {
  const vector = new Float32Array(DIMS);
  const tokens = tokenize(text);
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]!;
    vector[hash(token, 1) % DIMS] += 1;
    // Prefijo: acerca variantes morfológicas ("movilidad"/"movil").
    vector[hash(token.slice(0, 5), 7) % DIMS] += 0.6;
    const next = tokens[i + 1];
    if (next) vector[hash(`${token}_${next}`, 13) % DIMS] += 0.4;
  }
  let norm = 0;
  for (const value of vector) norm += value * value;
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < DIMS; i += 1) vector[i] = vector[i]! / norm;
  return vector;
}

export const hashEmbedder: EmbeddingProvider = {
  id: "hash-local",
  dimensions: DIMS,
  label: "Índice léxico local (sin descargas)",
  ready: async () => {},
  async embed(texts, onProgress) {
    const out = texts.map((text) => hashVector(text));
    onProgress?.(1);
    return out;
  },
};

// ------------------------------------------------------ MiniLM en un worker
type Pending = {
  resolve: (vectors: Float32Array[]) => void;
  reject: (error: Error) => void;
};

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();
let downloadRatio = 0;
const downloadListeners = new Set<(ratio: number) => void>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./embed.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (event: MessageEvent) => {
    const data = event.data as {
      type: string;
      id?: number;
      vectors?: Float32Array[];
      message?: string;
      progress?: number;
    };
    if (data.type === "download") {
      downloadRatio = data.progress ?? 0;
      downloadListeners.forEach((listener) => listener(downloadRatio));
      return;
    }
    const entry = data.id ? pending.get(data.id) : undefined;
    if (!entry) return;
    pending.delete(data.id!);
    if (data.type === "error") entry.reject(new Error(data.message ?? "embed-failed"));
    else entry.resolve(data.vectors ?? []);
  };
  worker.onerror = () => {
    pending.forEach((entry) => entry.reject(new Error("worker-failed")));
    pending.clear();
  };
  return worker;
}

function send(type: "embed" | "warm", texts: string[]): Promise<Float32Array[]> {
  const id = nextId++;
  const instance = getWorker();
  return new Promise<Float32Array[]>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    instance.postMessage({ type, id, texts });
  });
}

export function onModelDownloadProgress(listener: (ratio: number) => void): () => void {
  downloadListeners.add(listener);
  listener(downloadRatio);
  return () => downloadListeners.delete(listener);
}

const BATCH = 8;

export const transformersEmbedder: EmbeddingProvider = {
  id: "minilm-l6-v2",
  dimensions: DIMS,
  label: "MiniLM L6 v2 (local, Transformers.js)",
  async ready() {
    await send("warm", []);
  },
  async embed(texts, onProgress) {
    const out: Float32Array[] = [];
    for (let i = 0; i < texts.length; i += BATCH) {
      const slice = texts.slice(i, i + BATCH);
      const vectors = await send("embed", slice);
      out.push(...vectors);
      onProgress?.(Math.min(1, (i + slice.length) / Math.max(1, texts.length)));
    }
    return out;
  },
};

// -------------------------------------------------------------- selección
let active: EmbeddingProvider = hashEmbedder;
let attempted = false;
const providerListeners = new Set<(provider: EmbeddingProvider) => void>();

export function getEmbedder(): EmbeddingProvider {
  return active;
}

export function onEmbedderChange(listener: (provider: EmbeddingProvider) => void): () => void {
  providerListeners.add(listener);
  listener(active);
  return () => providerListeners.delete(listener);
}

function setActive(provider: EmbeddingProvider) {
  active = provider;
  providerListeners.forEach((listener) => listener(provider));
}

/** Intenta activar el modelo neuronal local; si falla, mantiene el respaldo. */
export async function ensureNeuralEmbedder(force = false): Promise<EmbeddingProvider> {
  if (active.id === transformersEmbedder.id) return active;
  if (attempted && !force) return active;
  attempted = true;
  try {
    await transformersEmbedder.ready();
    setActive(transformersEmbedder);
  } catch {
    setActive(hashEmbedder);
  }
  return active;
}

export function useHashEmbedder() {
  setActive(hashEmbedder);
}
