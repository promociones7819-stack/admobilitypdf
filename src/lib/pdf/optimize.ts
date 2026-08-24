/**
 * Optimización local de PDFs grandes.
 *
 * Todo ocurre en el dispositivo: pdf.js analiza y rasteriza, pdf-lib reconstruye.
 * El archivo original NUNCA se modifica: siempre se devuelven bytes nuevos.
 *
 * Este módulo es agnóstico del entorno (ventana o Web Worker): usa OffscreenCanvas
 * cuando está disponible y cae a un <canvas> del DOM en caso contrario.
 */
import { getPdfjs } from "./pdfjs";

export const LARGE_PDF_BYTES = 150 * 1024 * 1024;

export type OptimizeLevel = "smart" | "quality" | "balanced" | "max";

export interface OptimizeProgress {
  phase: "analyze" | "rebuild" | "raster" | "validate";
  done: number;
  total: number;
  /** Pasada de compresión (solo en el modo inteligente). */
  pass?: number;
}

export interface PdfAnalysis {
  pageCount: number;
  /** Media de caracteres de texto por página muestreada. */
  charsPerPage: number;
  /** Bytes por página del archivo original. */
  bytesPerPage: number;
  /** Escaneado / fotográfico: conviene optimizar imágenes. */
  imageHeavy: boolean;
}

export interface OptimizeResult {
  bytes: Uint8Array;
  pageCount: number;
  originalSize: number;
  size: number;
  strategy: "lossless" | "raster";
  /** true cuando el texto sigue siendo seleccionable y buscable. */
  textPreserved: boolean;
  analysis: PdfAnalysis;
}

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;

function makeCanvas(width: number, height: number): AnyCanvas {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function canvasToJpeg(canvas: AnyCanvas, quality: number): Promise<Uint8Array> {
  if ("convertToBlob" in canvas) {
    const blob = await canvas.convertToBlob({ type: "image/jpeg", quality });
    return new Uint8Array(await blob.arrayBuffer());
  }
  const blob = await new Promise<Blob | null>((resolve) =>
    (canvas as HTMLCanvasElement).toBlob((value) => resolve(value), "image/jpeg", quality),
  );
  if (!blob) throw new Error("jpeg-encode-failed");
  return new Uint8Array(await blob.arrayBuffer());
}

async function openDoc(bytes: Uint8Array) {
  const pdfjs = await getPdfjs();
  return pdfjs.getDocument({ data: bytes.slice(0), stopAtErrors: false }).promise;
}

/** Muestrea el documento para decidir la estrategia (texto vs. escaneado). */
export async function analyzePdf(bytes: Uint8Array): Promise<PdfAnalysis> {
  const doc = await openDoc(bytes);
  try {
    const total = doc.numPages;
    const sampleCount = Math.min(6, total);
    const step = Math.max(1, Math.floor(total / sampleCount));
    let chars = 0;
    let sampled = 0;
    for (let n = 1; n <= total && sampled < sampleCount; n += step) {
      const page = await doc.getPage(n);
      const text = await page.getTextContent();
      chars += text.items.reduce(
        (sum, item) => sum + (("str" in item ? item.str : "") || "").length,
        0,
      );
      sampled += 1;
      page.cleanup();
    }
    const charsPerPage = sampled ? chars / sampled : 0;
    const bytesPerPage = bytes.byteLength / Math.max(1, total);
    // Poco texto o páginas muy pesadas ⇒ dominan las imágenes.
    const imageHeavy = charsPerPage < 120 || bytesPerPage > 350 * 1024;
    return { pageCount: total, charsPerPage, bytesPerPage, imageHeavy };
  } finally {
    await doc.destroy();
  }
}

/** Reconstruye el PDF con pdf-lib: comprime la estructura sin tocar el contenido. */
async function rebuildLossless(bytes: Uint8Array): Promise<Uint8Array> {
  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.load(bytes.slice(0), {
    ignoreEncryption: true,
    throwOnInvalidObject: false,
    updateMetadata: false,
  });
  const saved = await doc.save({ useObjectStreams: true });
  return new Uint8Array(saved);
}

interface RasterOptions {
  dpi: number;
  quality: number;
}

/** Rasteriza cada página a JPEG y construye un PDF nuevo del mismo tamaño físico. */
async function rasterize(
  bytes: Uint8Array,
  { dpi, quality }: RasterOptions,
  onProgress?: (p: OptimizeProgress) => void,
  pass?: number,
): Promise<Uint8Array> {
  const { PDFDocument } = await import("pdf-lib");
  const out = await PDFDocument.create();
  const doc = await openDoc(bytes);
  try {
    const total = doc.numPages;
    for (let n = 1; n <= total; n += 1) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.max(0.2, dpi / 72) });
      const canvas = makeCanvas(
        Math.max(1, Math.floor(viewport.width)),
        Math.max(1, Math.floor(viewport.height)),
      );
      const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | null;
      if (!ctx) throw new Error("canvas-2d-unavailable");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({
        canvas: canvas as unknown as HTMLCanvasElement,
        canvasContext: ctx,
        viewport,
      } as Parameters<typeof page.render>[0]).promise;
      const jpeg = await canvasToJpeg(canvas, quality);
      const image = await out.embedJpg(jpeg);
      const target = out.addPage([base.width, base.height]);
      target.drawImage(image, { x: 0, y: 0, width: base.width, height: base.height });
      page.cleanup();
      if ("width" in canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
      onProgress?.({ phase: "raster", done: n, total, ...(pass ? { pass } : {}) });
    }
  } finally {
    await doc.destroy();
  }
  const saved = await out.save({ useObjectStreams: true });
  return new Uint8Array(saved);
}

const PRESETS: Record<Exclude<OptimizeLevel, "smart">, RasterOptions> = {
  quality: { dpi: 200, quality: 0.85 },
  balanced: { dpi: 150, quality: 0.72 },
  max: { dpi: 110, quality: 0.55 },
};

/** Pasadas del modo inteligente: de más a menos calidad, se para al bajar del objetivo. */
const SMART_PASSES: RasterOptions[] = [
  { dpi: 200, quality: 0.82 },
  { dpi: 160, quality: 0.72 },
  { dpi: 130, quality: 0.62 },
  { dpi: 100, quality: 0.5 },
];

export interface OptimizeOptions {
  level: OptimizeLevel;
  /** Tamaño objetivo en bytes (por defecto 150 MB). */
  target?: number;
  onProgress?: (p: OptimizeProgress) => void;
}

export async function optimizePdf(
  bytes: Uint8Array,
  { level, target = LARGE_PDF_BYTES, onProgress }: OptimizeOptions,
): Promise<OptimizeResult> {
  const originalSize = bytes.byteLength;
  onProgress?.({ phase: "analyze", done: 0, total: 1 });
  const analysis = await analyzePdf(bytes);
  onProgress?.({ phase: "analyze", done: 1, total: 1 });

  onProgress?.({ phase: "rebuild", done: 0, total: 1 });
  let best: Uint8Array;
  try {
    best = await rebuildLossless(bytes);
  } catch (error) {
    console.warn("[pdf] no se pudo reconstruir sin pérdidas", error);
    best = bytes.slice(0);
  }
  if (best.byteLength > originalSize) best = bytes.slice(0);
  onProgress?.({ phase: "rebuild", done: 1, total: 1 });

  const result = (data: Uint8Array, strategy: OptimizeResult["strategy"]): OptimizeResult => ({
    bytes: data,
    pageCount: analysis.pageCount,
    originalSize,
    size: data.byteLength,
    strategy,
    textPreserved: strategy === "lossless" || analysis.charsPerPage < 20,
    analysis,
  });

  // Los PDFs de texto nunca se rasterizan: el texto debe seguir siendo buscable.
  if (!analysis.imageHeavy) return result(best, "lossless");

  if (level === "quality" || best.byteLength <= target) {
    if (level === "quality") {
      // Calidad máxima: rasteriza a alta resolución solo si sigue siendo enorme.
      if (best.byteLength <= target) return result(best, "lossless");
      const raster = await rasterize(bytes, PRESETS.quality, onProgress);
      return raster.byteLength < best.byteLength
        ? result(raster, "raster")
        : result(best, "lossless");
    }
    return result(best, "lossless");
  }

  if (level === "smart") {
    let last: Uint8Array | null = null;
    for (let i = 0; i < SMART_PASSES.length; i += 1) {
      const candidate = await rasterize(bytes, SMART_PASSES[i]!, onProgress, i + 1);
      last = !last || candidate.byteLength < last.byteLength ? candidate : last;
      if (candidate.byteLength <= target) return result(candidate, "raster");
    }
    if (last && last.byteLength < best.byteLength) return result(last, "raster");
    return result(best, "lossless");
  }

  const raster = await rasterize(bytes, PRESETS[level], onProgress);
  return raster.byteLength < best.byteLength ? result(raster, "raster") : result(best, "lossless");
}

/**
 * Validación obligatoria antes de abrir el PDF optimizado en el editor:
 * debe ser un PDF real, con el mismo número de páginas y renderizable.
 */
export async function validatePdf(
  bytes: Uint8Array,
  expectedPages: number,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    const header = new TextDecoder().decode(bytes.slice(0, 1024));
    if (!header.includes("%PDF")) return { ok: false, reason: "no-es-pdf" };
    const doc = await openDoc(bytes);
    try {
      if (doc.numPages !== expectedPages) return { ok: false, reason: "faltan-paginas" };
      const samples = Array.from(new Set([1, Math.ceil(doc.numPages / 2), doc.numPages]));
      for (const pageNumber of samples) {
        const page = await doc.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 0.2 });
        const canvas = makeCanvas(
          Math.max(1, Math.floor(viewport.width)),
          Math.max(1, Math.floor(viewport.height)),
        );
        const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | null;
        if (!ctx) return { ok: false, reason: "sin-canvas" };
        await page.render({
          canvas: canvas as unknown as HTMLCanvasElement,
          canvasContext: ctx,
          viewport,
        } as Parameters<typeof page.render>[0]).promise;
        page.cleanup();
        canvas.width = 0;
        canvas.height = 0;
      }
      return { ok: true };
    } finally {
      await doc.destroy();
    }
  } catch (error) {
    console.error("[pdf] validación del PDF optimizado", error);
    return { ok: false, reason: "no-se-puede-renderizar" };
  }
}

export function formatMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
