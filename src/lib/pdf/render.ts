import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { normalizeRotation } from "./types";

export interface RenderResult {
  width: number;
  height: number;
}

export async function getPageSize(
  doc: PDFDocumentProxy,
  pageNumber: number,
  extraRotation = 0,
): Promise<RenderResult> {
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({
    scale: 1,
    rotation: normalizeRotation(page.rotate + extraRotation),
  });
  return { width: viewport.width, height: viewport.height };
}

/**
 * Renders a page into a canvas at CSS size `viewport.width x viewport.height`,
 * upscaling the backing store by the device pixel ratio for crisp output.
 */
export async function renderPageToCanvas(
  doc: PDFDocumentProxy,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  options: { scale: number; extraRotation?: number; signal?: { cancelled: boolean } },
): Promise<RenderResult> {
  const page = await doc.getPage(pageNumber);
  const rotation = normalizeRotation(page.rotate + (options.extraRotation ?? 0));
  const viewport = page.getViewport({ scale: options.scale, rotation });
  const dpr = Math.min(typeof window === "undefined" ? 1 : window.devicePixelRatio || 1, 2);

  canvas.width = Math.max(1, Math.floor(viewport.width * dpr));
  canvas.height = Math.max(1, Math.floor(viewport.height * dpr));
  canvas.style.width = `${Math.floor(viewport.width)}px`;
  canvas.style.height = `${Math.floor(viewport.height)}px`;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas-2d-unavailable");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const task: RenderTask = page.render({
    canvas,
    canvasContext: ctx,
    viewport,
    transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0],
  } as Parameters<typeof page.render>[0]);

  await task.promise;
  if (options.signal?.cancelled) task.cancel();
  return { width: viewport.width, height: viewport.height };
}

/** Renders a page to a data URL at a max box size — used for thumbnails. */
export async function renderThumbnail(
  doc: PDFDocumentProxy,
  pageNumber: number,
  extraRotation: number,
  maxWidth: number,
): Promise<string> {
  const page = await doc.getPage(pageNumber);
  const rotation = normalizeRotation(page.rotate + extraRotation);
  const base = page.getViewport({ scale: 1, rotation });
  const scale = maxWidth / base.width;
  const viewport = page.getViewport({ scale, rotation });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas-2d-unavailable");
  await page.render({
    canvas,
    canvasContext: ctx,
    viewport,
  } as Parameters<typeof page.render>[0]).promise;
  return canvas.toDataURL("image/png");
}
