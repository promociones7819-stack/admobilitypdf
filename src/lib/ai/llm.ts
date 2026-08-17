// LLM Layer — proveedores intercambiables. Todo se ejecuta en el dispositivo.
//  1. `extractiveProvider`: sintetiza la respuesta a partir de los fragmentos
//     recuperados (sin descargas, sin red, sin alucinaciones posibles).
//  2. `createWebLlmProvider`: modelo local real con WebGPU (WebLLM), opcional.
import type { LlmMessage, LlmProvider } from "./types";

export interface LocalModelInfo {
  id: string;
  label: string;
  sizeMb: number;
  vramMb: number;
  requiresWebGpu: boolean;
}

export const LOCAL_MODELS: LocalModelInfo[] = [
  {
    id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
    label: "Qwen2.5 1.5B Instruct",
    sizeMb: 950,
    vramMb: 1700,
    requiresWebGpu: true,
  },
  {
    id: "Llama-3.2-1B-Instruct-q4f16_1-MLC",
    label: "Llama 3.2 1B Instruct",
    sizeMb: 750,
    vramMb: 1400,
    requiresWebGpu: true,
  },
  {
    id: "Phi-3.5-mini-instruct-q4f16_1-MLC",
    label: "Phi 3.5 mini Instruct",
    sizeMb: 2200,
    vramMb: 3600,
    requiresWebGpu: true,
  },
];

export function hasWebGpu(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

// --------------------------------------------------- proveedor extractivo
const NO_ANSWER = "No encuentro esa información en las fuentes seleccionadas.";

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 30);
}

function keywords(question: string): string[] {
  return question
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9ñ]+/)
    .filter((token) => token.length > 3);
}

/**
 * Compone una respuesta citada seleccionando las frases más relevantes del
 * contexto. No genera texto propio, por lo que no puede inventar contenido.
 */
export function extractiveAnswer(question: string, context: string): string {
  const blocks = context.split(/\n\n---\n\n/).filter(Boolean);
  if (!blocks.length) return NO_ANSWER;
  const terms = keywords(question);
  type Candidate = { text: string; marker: string; score: number };
  const candidates: Candidate[] = [];

  blocks.forEach((block, index) => {
    const marker = `[${index + 1}]`;
    const body = block.split("\n").slice(1).join("\n");
    for (const sentence of sentences(body)) {
      const lower = sentence
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      let score = 0;
      for (const term of terms) if (lower.includes(term)) score += 1;
      candidates.push({ text: sentence, marker, score: score + 1 / (index + 3) });
    }
  });

  const best = candidates
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  if (!best.length) return NO_ANSWER;
  const matched = best.filter((candidate) => candidate.score >= 1);
  if (!matched.length) return NO_ANSWER;

  const seen = new Set<string>();
  const lines = matched
    .filter((candidate) => {
      const key = candidate.text.slice(0, 60);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((candidate) => `• ${candidate.text} ${candidate.marker}`);

  return `Según las fuentes seleccionadas:\n\n${lines.join("\n")}`;
}

function lastUser(messages: LlmMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]!.role === "user") return messages[i]!.content;
  }
  return "";
}

export const extractiveProvider: LlmProvider = {
  id: "extractive-local",
  label: "Extractivo local (sin descargas)",
  isReady: () => true,
  async generate(messages, onToken, signal) {
    const prompt = lastUser(messages);
    const contextMatch = /CONTEXTO:\n([\s\S]*?)\n\nPREGUNTA:/.exec(prompt);
    const question = /PREGUNTA:\s*([\s\S]*)$/.exec(prompt)?.[1] ?? prompt;
    const answer = extractiveAnswer(question, contextMatch?.[1] ?? "");
    // Streaming simulado para que la UI se comporte igual con cualquier motor.
    const tokens = answer.match(/\S+\s*/g) ?? [answer];
    let out = "";
    for (const token of tokens) {
      if (signal?.aborted) break;
      out += token;
      onToken(token);
      await new Promise((resolve) => setTimeout(resolve, 8));
    }
    return out;
  },
};

// -------------------------------------------------------- WebLLM (WebGPU)
type WebLlmEngine = {
  chat: {
    completions: {
      create: (options: {
        messages: LlmMessage[];
        stream: true;
        temperature: number;
      }) => Promise<AsyncIterable<{ choices: Array<{ delta: { content?: string } }> }>>;
    };
  };
};

const engines = new Map<string, WebLlmEngine>();

export async function loadWebLlm(
  modelId: string,
  onProgress: (info: { text: string; progress: number }) => void,
): Promise<void> {
  if (engines.has(modelId)) return;
  if (!hasWebGpu()) throw new Error("webgpu-unavailable");
  const webllm = await import("@mlc-ai/web-llm");
  const engine = (await webllm.CreateMLCEngine(modelId, {
    initProgressCallback: (report) =>
      onProgress({ text: report.text, progress: report.progress ?? 0 }),
  })) as unknown as WebLlmEngine;
  engines.set(modelId, engine);
}

export function isWebLlmLoaded(modelId: string): boolean {
  return engines.has(modelId);
}

export function unloadWebLlm(modelId: string) {
  engines.delete(modelId);
}

export function createWebLlmProvider(modelId: string): LlmProvider {
  return {
    id: `webllm:${modelId}`,
    label: LOCAL_MODELS.find((model) => model.id === modelId)?.label ?? modelId,
    isReady: () => engines.has(modelId),
    async generate(messages, onToken, signal) {
      const engine = engines.get(modelId);
      if (!engine) throw new Error("model-not-loaded");
      const stream = await engine.chat.completions.create({
        messages,
        stream: true,
        temperature: 0.2,
      });
      let out = "";
      for await (const part of stream) {
        if (signal?.aborted) break;
        const delta = part.choices[0]?.delta?.content ?? "";
        if (!delta) continue;
        out += delta;
        onToken(delta);
      }
      return out;
    },
  };
}
