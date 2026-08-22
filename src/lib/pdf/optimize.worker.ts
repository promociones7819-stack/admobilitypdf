/// <reference lib="webworker" />
/**
 * Worker de optimización: mantiene la interfaz fluida con PDFs muy grandes.
 * Requiere OffscreenCanvas (Safari 16.4+, Chrome). El cliente cae al hilo
 * principal cuando no está disponible.
 */
import { optimizePdf, validatePdf, type OptimizeLevel } from "./optimize";

interface RequestMessage {
  bytes: ArrayBuffer;
  level: OptimizeLevel;
  target?: number;
}

self.onmessage = async (event: MessageEvent<RequestMessage>) => {
  const { bytes, level, target } = event.data;
  try {
    const result = await optimizePdf(new Uint8Array(bytes), {
      level,
      ...(target ? { target } : {}),
      onProgress: (progress) => self.postMessage({ type: "progress", progress }),
    });
    const validation = await validatePdf(result.bytes, result.pageCount);
    const buffer = result.bytes.buffer as ArrayBuffer;
    self.postMessage(
      {
        type: "done",
        result: { ...result, bytes: buffer },
        validation,
      },
      [buffer],
    );
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
