/**
 * Puente cliente ⇄ worker para la optimización de PDFs grandes.
 * Si el worker (u OffscreenCanvas) no está disponible, se ejecuta en el hilo
 * principal para que iPad/Safari antiguos sigan funcionando.
 */
import {
  optimizePdf,
  validatePdf,
  type OptimizeLevel,
  type OptimizeProgress,
  type OptimizeResult,
} from "./optimize";

export interface OptimizeRun {
  result: OptimizeResult;
  validation: { ok: true } | { ok: false; reason: string };
  ranInWorker: boolean;
}

function runInWorker(
  bytes: Uint8Array,
  level: OptimizeLevel,
  target: number,
  onProgress?: (p: OptimizeProgress) => void,
): Promise<OptimizeRun> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./optimize.worker.ts", import.meta.url), {
      type: "module",
    });
    const copy = bytes.slice(0);
    const buffer = copy.buffer as ArrayBuffer;
    worker.onmessage = (event: MessageEvent) => {
      const data = event.data as
        | { type: "progress"; progress: OptimizeProgress }
        | {
            type: "done";
            result: Omit<OptimizeResult, "bytes"> & { bytes: ArrayBuffer };
            validation: OptimizeRun["validation"];
          }
        | { type: "error"; message: string };
      if (data.type === "progress") {
        onProgress?.(data.progress);
        return;
      }
      if (data.type === "error") {
        worker.terminate();
        reject(new Error(data.message));
        return;
      }
      worker.terminate();
      resolve({
        result: { ...data.result, bytes: new Uint8Array(data.result.bytes) },
        validation: data.validation,
        ranInWorker: true,
      });
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || "worker-error"));
    };
    worker.postMessage({ bytes: buffer, level, target }, [buffer]);
  });
}

export async function runOptimization(
  bytes: Uint8Array,
  level: OptimizeLevel,
  target: number,
  onProgress?: (p: OptimizeProgress) => void,
): Promise<OptimizeRun> {
  const canUseWorker =
    typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined";
  if (canUseWorker) {
    try {
      return await runInWorker(bytes, level, target, onProgress);
    } catch (error) {
      console.warn("[pdf] worker de optimización no disponible, uso hilo principal", error);
    }
  }
  const result = await optimizePdf(bytes, { level, target, ...(onProgress ? { onProgress } : {}) });
  const validation = await validatePdf(result.bytes, result.pageCount);
  return { result, validation, ranInWorker: false };
}
