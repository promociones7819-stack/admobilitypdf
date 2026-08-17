import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { PageEntry, PdfSource } from "./types";
import { normalizeRotation } from "./types";
import {
  displaySize,
  hexToRgb,
  mapDisplayPoint,
  type Annotation,
  type ImageAsset,
} from "./annotations";

export class PdfError extends Error {}

async function loadLibDocs(
  pages: PageEntry[],
  sources: Record<string, PdfSource>,
): Promise<Map<string, PDFDocument>> {
  const map = new Map<string, PDFDocument>();
  for (const sourceId of new Set(pages.map((p) => p.sourceId))) {
    const source = sources[sourceId];
    if (!source) throw new PdfError("missing-source");
    map.set(
      sourceId,
      await PDFDocument.load(source.bytes.slice(0), { ignoreEncryption: true }),
    );
  }
  return map;
}

/** Helvetica only covers WinAnsi; replace anything it cannot encode. */
function sanitizeText(value: string): string {
  return value.replace(/[^\u0000-\u00ff]/g, "?");
}

interface DrawContext {
  page: PDFPage;
  pageWidth: number;
  pageHeight: number;
  rotation: number;
  view: { width: number; height: number };
  font: PDFFont;
}

function drawAnnotation(
  ctx: DrawContext,
  annotation: Annotation,
  images: Map<string, unknown>,
) {
  const { page, pageWidth, pageHeight, rotation, view, font } = ctx;
  const { r, g, b } = hexToRgb(annotation.color);
  const color = rgb(r, g, b);
  const map = (u: number, v: number) => mapDisplayPoint(u, v, pageWidth, pageHeight, rotation);
  const swapped = rotation % 180 === 90;

  const boxWidth = annotation.width * view.width;
  const boxHeight = annotation.height * view.height;
  const anchor = map(annotation.x, annotation.y + annotation.height);

  switch (annotation.kind) {
    case "highlight":
    case "rect": {
      const filled = annotation.filled || annotation.kind === "highlight";
      page.drawRectangle({
        x: anchor.x,
        y: anchor.y,
        width: boxWidth,
        height: boxHeight,
        rotate: degrees(rotation),
        ...(filled ? { color, opacity: annotation.opacity } : {}),
        ...(annotation.kind === "rect"
          ? {
              borderColor: color,
              borderWidth: Math.max(0.5, annotation.strokeWidth),
              borderOpacity: annotation.opacity,
            }
          : {}),
      });
      break;
    }
    case "underline":
    case "strike": {
      const v =
        annotation.kind === "underline"
          ? annotation.y + annotation.height
          : annotation.y + annotation.height / 2;
      const start = map(annotation.x, v);
      const end = map(annotation.x + annotation.width, v);
      page.drawLine({
        start,
        end,
        thickness: Math.max(0.75, annotation.strokeWidth),
        color,
        opacity: annotation.opacity,
      });
      break;
    }
    case "ellipse": {
      const center = map(annotation.x + annotation.width / 2, annotation.y + annotation.height / 2);
      const xScale = (swapped ? boxHeight : boxWidth) / 2;
      const yScale = (swapped ? boxWidth : boxHeight) / 2;
      page.drawEllipse({
        x: center.x,
        y: center.y,
        xScale: Math.max(0.5, xScale),
        yScale: Math.max(0.5, yScale),
        ...(annotation.filled ? { color, opacity: annotation.opacity } : {}),
        borderColor: color,
        borderWidth: Math.max(0.5, annotation.strokeWidth),
        borderOpacity: annotation.opacity,
      });
      break;
    }
    case "ink": {
      const points = annotation.points ?? [];
      for (let i = 1; i < points.length; i += 1) {
        const previous = points[i - 1]!;
        const current = points[i]!;
        page.drawLine({
          start: map(annotation.x + previous.x * annotation.width, annotation.y + previous.y * annotation.height),
          end: map(annotation.x + current.x * annotation.width, annotation.y + current.y * annotation.height),
          thickness: Math.max(0.5, annotation.strokeWidth),
          color,
          opacity: annotation.opacity,
          lineCap: 1,
        });
      }
      break;
    }
    case "text": {
      const size = annotation.fontSize ?? 16;
      const lines = sanitizeText(annotation.text ?? "").split("\n");
      const lineHeight = size * 1.25;
      lines.forEach((line, index) => {
        if (!line) return;
        const baselineV = annotation.y + (size * 0.82 + index * lineHeight) / view.height;
        const at = map(annotation.x, baselineV);
        page.drawText(line, {
          x: at.x,
          y: at.y,
          size,
          font,
          color,
          opacity: annotation.opacity,
          rotate: degrees(rotation),
        });
      });
      break;
    }
    case "image": {
      const embedded = annotation.imageId ? images.get(annotation.imageId) : undefined;
      if (!embedded) break;
      page.drawImage(embedded as Parameters<PDFPage["drawImage"]>[0], {
        x: anchor.x,
        y: anchor.y,
        width: boxWidth,
        height: boxHeight,
        rotate: degrees(rotation),
        opacity: annotation.opacity,
      });
      break;
    }
  }
}

export interface BuildOptions {
  annotations?: Annotation[];
  images?: Record<string, ImageAsset>;
}

/**
 * Builds a real PDF from the working page structure, preserving order, rotation
 * and burning in every annotation.
 */
export async function buildPdf(
  pages: PageEntry[],
  sources: Record<string, PdfSource>,
  options: BuildOptions = {},
): Promise<Uint8Array> {
  if (pages.length === 0) throw new PdfError("empty-document");
  const libDocs = await loadLibDocs(pages, sources);
  const out = await PDFDocument.create();
  const annotations = options.annotations ?? [];
  const assets = options.images ?? {};

  let font: PDFFont | null = null;
  const embeddedImages = new Map<string, unknown>();

  for (const entry of pages) {
    const src = libDocs.get(entry.sourceId);
    if (!src) throw new PdfError("missing-source");
    const [copied] = await out.copyPages(src, [entry.sourceIndex - 1]);
    if (!copied) throw new PdfError("missing-page");
    const intrinsic = copied.getRotation().angle;
    const rotation = normalizeRotation(intrinsic + entry.rotation);
    copied.setRotation(degrees(rotation));
    out.addPage(copied);

    const pageAnnotations = annotations.filter((a) => a.pageId === entry.id);
    if (pageAnnotations.length === 0) continue;

    const { width: pageWidth, height: pageHeight } = copied.getSize();
    const view = displaySize(pageWidth, pageHeight, rotation);
    if (!font) font = await out.embedFont(StandardFonts.Helvetica);

    for (const annotation of pageAnnotations) {
      if (annotation.kind === "image" && annotation.imageId) {
        const asset = assets[annotation.imageId];
        if (asset && !embeddedImages.has(asset.id)) {
          const embedded =
            asset.mime === "image/png"
              ? await out.embedPng(asset.bytes.slice(0))
              : await out.embedJpg(asset.bytes.slice(0));
          embeddedImages.set(asset.id, embedded);
        }
      }
      drawAnnotation(
        { page: copied, pageWidth, pageHeight, rotation, view, font },
        annotation,
        embeddedImages,
      );
    }
  }

  return out.save();
}

export function downloadBytes(bytes: Uint8Array, fileName: string) {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const blob = new Blob([buffer], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function editedFileName(original: string | null): string {
  if (!original) return "documento-editado.pdf";
  const base = original.replace(/\.pdf$/i, "");
  return `${base}-editado.pdf`;
}
