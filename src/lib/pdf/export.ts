import {
  LineCapStyle,
  PDFDocument,
  StandardFonts,
  degrees,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { PageEntry, PdfSource } from "./types";
import { BLANK_SOURCE_ID, normalizeRotation } from "./types";
import {
  displaySize,
  hexToRgb,
  mapDisplayPoint,
  type Annotation,
  type ImageAsset,
} from "./annotations";
import { saveBytes } from "@/lib/download";
import { embeddedFontUrls, findFont } from "./fonts";

export class PdfError extends Error {}

/** What to do with study strips ("Tiras") when exporting. */
export type CoverExportMode = "omit" | "cover" | "outline";

async function loadLibDocs(
  pages: PageEntry[],
  sources: Record<string, PdfSource>,
): Promise<Map<string, PDFDocument>> {
  const map = new Map<string, PDFDocument>();
  const ids = new Set(
    pages.filter((p) => !p.blank && p.sourceId !== BLANK_SOURCE_ID).map((p) => p.sourceId),
  );
  for (const sourceId of ids) {
    const source = sources[sourceId];
    if (!source) throw new PdfError("missing-source");
    try {
      // pdf.js tolerates some broken cross-reference tables that pdf-lib later
      // rejects while copyPages walks the page tree. Re-saving first rebuilds
      // those references and prevents the opaque "Expected instance of…" error.
      const parsed = await PDFDocument.load(source.bytes.slice(0), {
        ignoreEncryption: true,
        throwOnInvalidObject: false,
        updateMetadata: false,
      });
      const normalizedBytes = await parsed.save({ useObjectStreams: false });
      const normalized = await PDFDocument.load(normalizedBytes, {
        ignoreEncryption: true,
        throwOnInvalidObject: false,
        updateMetadata: false,
      });
      map.set(sourceId, normalized);
    } catch (error) {
      console.error(`[pdf] no se pudo normalizar ${source.name}`, error);
      throw new PdfError("corrupt-source");
    }
  }
  return map;
}

/** Base-14 fonts only cover WinAnsi; embedded TTFs handle full Unicode. */
function sanitizeText(value: string, embedded: boolean): string {
  return embedded
    ? value
    : Array.from(value, (character) =>
        (character.codePointAt(0) ?? 0) <= 0xff ? character : "?",
      ).join("");
}

export interface ResolvedFont {
  font: PDFFont;
  embedded: boolean;
}

/** Resolves a font family (+ weight/style) into a real embedded PDF font. */
export type FontResolver = (
  family: string | undefined,
  bold: boolean,
  italic: boolean,
) => Promise<ResolvedFont>;

const ttfCache = new Map<string, Uint8Array>();

async function fetchTtf(url: string): Promise<Uint8Array> {
  const cached = ttfCache.get(url);
  if (cached) return cached;
  const response = await fetch(url);
  if (!response.ok) throw new PdfError("font-unavailable");
  const bytes = new Uint8Array(await response.arrayBuffer());
  ttfCache.set(url, bytes);
  return bytes;
}

function standardFontName(group: string | undefined, bold: boolean, italic: boolean) {
  if (group === "Times")
    return bold && italic
      ? StandardFonts.TimesRomanBoldItalic
      : bold
        ? StandardFonts.TimesRomanBold
        : italic
          ? StandardFonts.TimesRomanItalic
          : StandardFonts.TimesRoman;
  if (group === "Courier")
    return bold && italic
      ? StandardFonts.CourierBoldOblique
      : bold
        ? StandardFonts.CourierBold
        : italic
          ? StandardFonts.CourierOblique
          : StandardFonts.Courier;
  return bold && italic
    ? StandardFonts.HelveticaBoldOblique
    : bold
      ? StandardFonts.HelveticaBold
      : italic
        ? StandardFonts.HelveticaOblique
        : StandardFonts.Helvetica;
}

/** Families that had to fall back to a base-14 font during the last export. */
let lastFontFallbacks: string[] = [];

export function getFontFallbacks(): string[] {
  return lastFontFallbacks;
}

async function createFontResolver(out: PDFDocument): Promise<FontResolver> {
  const cache = new Map<string, ResolvedFont>();
  let fontkitReady = false;

  return async (family, bold, italic) => {
    const def = findFont(family);
    const key = `${def.family}|${bold ? "b" : ""}${italic ? "i" : ""}`;
    const existing = cache.get(key);
    if (existing) return existing;

    let resolved: ResolvedFont | null = null;
    if (def.kind === "embedded") {
      for (const url of embeddedFontUrls(def, bold, italic)) {
        try {
          if (!fontkitReady) {
            const fontkit = (await import("@pdf-lib/fontkit")).default;
            out.registerFontkit(fontkit);
            fontkitReady = true;
          }
          const bytes = await fetchTtf(url);
          const font = await out.embedFont(bytes.slice(0), { subset: true });
          resolved = { font, embedded: true };
          break;
        } catch (error) {
          console.warn(`[pdf] no se pudo incrustar ${def.family} desde ${url}`, error);
          resolved = null;
        }
      }
      if (!resolved && !lastFontFallbacks.includes(def.label))
        lastFontFallbacks = [...lastFontFallbacks, def.label];
    }
    if (!resolved) {
      const font = await out.embedFont(standardFontName(def.standard, bold, italic));
      resolved = { font, embedded: false };
    }
    cache.set(key, resolved);
    return resolved;
  };
}

/** Splits text into lines that fit `maxWidth` (in points). */
export function wrapLines(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  const width = (value: string) => {
    try {
      return font.widthOfTextAtSize(value, size);
    } catch {
      return value.length * size * 0.5;
    }
  };
  for (const paragraph of text.split("\n")) {
    if (!paragraph) {
      out.push("");
      continue;
    }
    let line = "";
    for (const word of paragraph.split(/(\s+)/)) {
      if (!word) continue;
      const candidate = line + word;
      if (line && maxWidth > 0 && width(candidate) > maxWidth) {
        out.push(line.trimEnd());
        line = word.trimStart();
      } else {
        line = candidate;
      }
    }
    out.push(line.trimEnd());
  }
  return out;
}

interface DrawContext {
  page: PDFPage;
  pageWidth: number;
  pageHeight: number;
  rotation: number;
  view: { width: number; height: number };
  font: PDFFont;
  fontEmbedded: boolean;
  coverMode: CoverExportMode;
}

function drawStroke(ctx: DrawContext, annotation: Annotation, roundCaps: boolean) {
  const { page, pageWidth, pageHeight, rotation, view } = ctx;
  const { r, g, b } = hexToRgb(annotation.color);
  const color = rgb(r, g, b);
  const map = (u: number, v: number) => mapDisplayPoint(u, v, pageWidth, pageHeight, rotation);
  const points = annotation.points ?? [];
  const base = Math.max(0.5, annotation.strokeWidth);
  for (let i = 1; i < points.length; i += 1) {
    const previous = points[i - 1]!;
    const current = points[i]!;
    const pressure = ((previous.p ?? 1) + (current.p ?? 1)) / 2;
    page.drawLine({
      start: map(
        annotation.x + previous.x * annotation.width,
        annotation.y + previous.y * annotation.height,
      ),
      end: map(
        annotation.x + current.x * annotation.width,
        annotation.y + current.y * annotation.height,
      ),
      thickness: Math.max(0.5, base * pressure),
      color,
      opacity: annotation.opacity,
      lineCap: roundCaps ? LineCapStyle.Round : LineCapStyle.Butt,
    });
  }
  void view;
}

function drawAnnotation(ctx: DrawContext, annotation: Annotation, images: Map<string, unknown>) {
  const { page, pageWidth, pageHeight, rotation, view, font } = ctx;
  const { r, g, b } = hexToRgb(annotation.color);
  const color = rgb(r, g, b);
  const map = (u: number, v: number) => mapDisplayPoint(u, v, pageWidth, pageHeight, rotation);
  const swapped = rotation % 180 === 90;

  const boxWidth = annotation.width * view.width;
  const boxHeight = annotation.height * view.height;
  const anchor = map(annotation.x, annotation.y + annotation.height);

  switch (annotation.kind) {
    case "redact": {
      page.drawRectangle({
        x: anchor.x,
        y: anchor.y,
        width: boxWidth,
        height: boxHeight,
        rotate: degrees(rotation),
        color: rgb(0, 0, 0),
        opacity: 1,
      });
      break;
    }
    case "studyCover": {
      if (ctx.coverMode === "omit") break;
      const outline = ctx.coverMode === "outline";
      page.drawRectangle({
        x: anchor.x,
        y: anchor.y,
        width: boxWidth,
        height: boxHeight,
        rotate: degrees(rotation),
        ...(outline
          ? { borderColor: color, borderWidth: 1, borderOpacity: annotation.opacity }
          : { color, opacity: annotation.opacity }),
      });
      break;
    }
    case "highlight": {
      // Free highlighter strokes; legacy box highlights fall back to a rectangle.
      if ((annotation.points ?? []).length > 1) {
        drawStroke(ctx, annotation, true);
        break;
      }
      page.drawRectangle({
        x: anchor.x,
        y: anchor.y,
        width: boxWidth,
        height: boxHeight,
        rotate: degrees(rotation),
        color,
        opacity: annotation.opacity,
      });
      break;
    }
    case "rect": {
      page.drawRectangle({
        x: anchor.x,
        y: anchor.y,
        width: boxWidth,
        height: boxHeight,
        rotate: degrees(rotation),
        ...(annotation.filled ? { color, opacity: annotation.opacity } : {}),
        borderColor: color,
        borderWidth: Math.max(0.5, annotation.strokeWidth),
        borderOpacity: annotation.opacity,
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
        lineCap: LineCapStyle.Round,
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
      drawStroke(ctx, annotation, true);
      break;
    }
    case "line":
    case "arrow": {
      const points =
        annotation.points?.length === 2
          ? annotation.points
          : [
              { x: 0, y: 0 },
              { x: 1, y: 1 },
            ];
      drawStroke(ctx, { ...annotation, points }, true);
      if (annotation.kind === "arrow") {
        const fromPoint = points[0]!;
        const tipPoint = points[1]!;
        const from = map(
          annotation.x + fromPoint.x * annotation.width,
          annotation.y + fromPoint.y * annotation.height,
        );
        const tip = map(
          annotation.x + tipPoint.x * annotation.width,
          annotation.y + tipPoint.y * annotation.height,
        );
        const angle = Math.atan2(tip.y - from.y, tip.x - from.x);
        const distance = Math.hypot(tip.x - from.x, tip.y - from.y);
        const head = Math.max(6, Math.min(18, distance * 0.25));
        for (const offset of [-0.55, 0.55]) {
          page.drawLine({
            start: tip,
            end: {
              x: tip.x - Math.cos(angle + offset) * head,
              y: tip.y - Math.sin(angle + offset) * head,
            },
            thickness: Math.max(0.75, annotation.strokeWidth),
            color,
            opacity: annotation.opacity,
            lineCap: LineCapStyle.Round,
          });
        }
      }
      break;
    }
    case "text": {
      const size = annotation.fontSize ?? 16;
      const raw = sanitizeText(annotation.text ?? "", ctx.fontEmbedded);
      const lines = wrapLines(raw, font, size, boxWidth);
      const lineHeight = size * 1.25;
      const align = annotation.align ?? "left";
      lines.forEach((line, index) => {
        if (!line) return;
        const textWidth = (() => {
          try {
            return font.widthOfTextAtSize(line, size);
          } catch {
            return line.length * size * 0.5;
          }
        })();
        const offset =
          align === "center"
            ? Math.max(0, (boxWidth - textWidth) / 2)
            : align === "right"
              ? Math.max(0, boxWidth - textWidth)
              : 0;
        const baselineV = annotation.y + (size * 0.82 + index * lineHeight) / view.height;
        const startU = annotation.x + offset / view.width;
        const at = map(startU, baselineV);
        page.drawText(line, {
          x: at.x,
          y: at.y,
          size,
          font,
          color,
          opacity: annotation.opacity,
          rotate: degrees(rotation),
        });
        if (annotation.underline) {
          const uV = baselineV + (size * 0.14) / view.height;
          const start = map(startU, uV);
          const end = map(startU + textWidth / view.width, uV);
          page.drawLine({
            start,
            end,
            thickness: Math.max(0.5, size * 0.06),
            color,
            opacity: annotation.opacity,
            lineCap: LineCapStyle.Round,
          });
        }
      });
      break;
    }

    case "image":
    case "signature": {
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
  /** Study strips are an app-side study layer; omitted by default. */
  coverMode?: CoverExportMode;
}

/**
 * Builds a real PDF from the working page structure, preserving order, rotation
 * and burning in every annotation. The original source bytes are never mutated.
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
  const coverMode = options.coverMode ?? "omit";

  lastFontFallbacks = [];
  const resolveFont = await createFontResolver(out);
  const embeddedImages = new Map<string, unknown>();

  for (const entry of pages) {
    let target: PDFPage;
    let rotation: number;

    if (entry.blank || entry.sourceId === BLANK_SOURCE_ID) {
      const size = entry.blank ?? { width: 595.28, height: 841.89 };
      target = out.addPage([size.width, size.height]);
      rotation = normalizeRotation(entry.rotation);
      target.setRotation(degrees(rotation));
    } else {
      const src = libDocs.get(entry.sourceId);
      if (!src) throw new PdfError("missing-source");
      let copied: PDFPage | undefined;
      try {
        [copied] = await out.copyPages(src, [entry.sourceIndex - 1]);
      } catch (error) {
        console.error(`[pdf] no se pudo copiar la página ${entry.sourceIndex}`, error);
        throw new PdfError("corrupt-source");
      }
      if (!copied) throw new PdfError("missing-page");
      rotation = normalizeRotation(copied.getRotation().angle + entry.rotation);
      copied.setRotation(degrees(rotation));
      out.addPage(copied);
      target = copied;
    }

    const pageAnnotations = annotations.filter((a) => a.pageId === entry.id);
    if (pageAnnotations.length === 0) continue;

    const { width: pageWidth, height: pageHeight } = target.getSize();
    const view = displaySize(pageWidth, pageHeight, rotation);

    for (const annotation of pageAnnotations) {
      if (annotation.kind === "studyCover" && coverMode === "omit") continue;
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
      const { font, embedded } = await resolveFont(
        annotation.fontFamily,
        !!annotation.bold,
        !!annotation.italic,
      );
      drawAnnotation(
        {
          page: target,
          pageWidth,
          pageHeight,
          rotation,
          view,
          font,
          fontEmbedded: embedded,
          coverMode,
        },
        annotation,
        embeddedImages,
      );
    }
  }

  return out.save();
}

export async function downloadBytes(bytes: Uint8Array, fileName: string) {
  await saveBytes(bytes, fileName, "application/pdf");
}

export function editedFileName(original: string | null): string {
  if (!original) return "documento-editado.pdf";
  const base = original.replace(/\.pdf$/i, "");
  return `${base}-editado.pdf`;
}
