/// <reference lib="webworker" />
// Embedding Layer (worker) — Transformers.js dentro de un Web Worker para no
// bloquear la interfaz. El modelo se descarga desde el CDN de Hugging Face;
// los documentos del usuario nunca salen del dispositivo.

type ExtractorFn = (
  texts: string[],
  options: { pooling: "mean"; normalize: boolean },
) => Promise<{ tolist: () => number[][] }>;

let extractor: ExtractorFn | null = null;
let loading: Promise<ExtractorFn> | null = null;

const MODEL_ID = "Xenova/all-MiniLM-L6-v2";

async function getExtractor(): Promise<ExtractorFn> {
  if (extractor) return extractor;
  if (!loading) {
    loading = (async () => {
      const { pipeline, env } = await import("@huggingface/transformers");
      env.allowLocalModels = false;
      const pipe = (await pipeline("feature-extraction", MODEL_ID, {
        dtype: "q8",
        progress_callback: (info: unknown) => {
          const data = info as { status?: string; progress?: number; file?: string };
          if (data?.status === "progress") {
            self.postMessage({
              type: "download",
              progress: (data.progress ?? 0) / 100,
              file: data.file,
            });
          }
        },
      })) as unknown as ExtractorFn;
      extractor = pipe;
      return pipe;
    })();
  }
  return loading;
}

interface EmbedRequest {
  type: "embed";
  id: number;
  texts: string[];
}

interface WarmRequest {
  type: "warm";
  id: number;
}

self.onmessage = async (event: MessageEvent<EmbedRequest | WarmRequest>) => {
  const message = event.data;
  try {
    const pipe = await getExtractor();
    if (message.type === "warm") {
      await pipe(["ok"], { pooling: "mean", normalize: true });
      self.postMessage({ type: "warm-done", id: message.id });
      return;
    }
    const output = await pipe(message.texts, { pooling: "mean", normalize: true });
    const vectors = output.tolist().map((row) => new Float32Array(row));
    self.postMessage({ type: "embed-done", id: message.id, vectors });
  } catch (error) {
    self.postMessage({
      type: "error",
      id: message.id,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
