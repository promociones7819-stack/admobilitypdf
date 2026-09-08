// Document Layer — extracción de texto por páginas. Ampliable con nuevos
// parsers (DOCX, EPUB, imágenes con OCR, URLs) implementando DocumentParser.
import { getPdfjs } from "@/lib/pdf/pdfjs";
import type { PDFPageProxy } from "pdfjs-dist";
import type { DocumentParser, ParsedDocument, SourceKind } from "./types";

export function detectKind(file: File): SourceKind | null {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf") || file.type === "application/pdf") return "pdf";
  if (name.endsWith(".md") || name.endsWith(".markdown")) return "md";
  if (name.endsWith(".txt") || file.type.startsWith("text/")) return "txt";
  return null;
}

const PAGE_CHARS = 3000;
const MIN_NATIVE_TEXT_CHARS = 40;

type OcrWorker = {
  recognize: (
    image: HTMLCanvasElement,
    options?: { rotateAuto?: boolean },
  ) => Promise<{ data: { text?: string } }>;
  terminate: () => Promise<unknown>;
};

/** Renderiza y reconoce únicamente una página sin capa de texto aprovechable. */
async function ocrPage(page: PDFPageProxy, worker: OcrWorker) {
  const viewport = page.getViewport({ scale: 1.8 });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("canvas-2d-unavailable");
  await page.render({ canvas, canvasContext: context, viewport }).promise;
  try {
    const result = await worker.recognize(canvas, { rotateAuto: true });
    return normalizeText(result.data.text ?? "");
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

/** Divide texto plano en "páginas" sintéticas para poder citar posiciones. */
function paginateText(text: string): ParsedDocument {
  const clean = text.replace(/\r\n/g, "\n");
  const blocks = clean.split(/\n{2,}/);
  const pages: ParsedDocument["pages"] = [];
  let current = "";
  for (const block of blocks) {
    if (current.length + block.length > PAGE_CHARS && current) {
      pages.push({ pageNumber: pages.length + 1, text: current.trim() });
      current = "";
    }
    current += `${block}\n\n`;
  }
  if (current.trim()) pages.push({ pageNumber: pages.length + 1, text: current.trim() });
  return { pages: pages.length ? pages : [{ pageNumber: 1, text: "" }] };
}

export const pdfParser: DocumentParser = {
  id: "pdfjs",
  supports: (file) => detectKind(file) === "pdf",
  async parse(file, onProgress) {
    const pdfjs = await getPdfjs();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const doc = await pdfjs.getDocument({ data: bytes.slice(0) }).promise;
    const pages: ParsedDocument["pages"] = [];
    let worker: OcrWorker | null = null;
    let ocrPageCount = 0;
    try {
      for (let i = 1; i <= doc.numPages; i += 1) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        // Reconstruye líneas usando los saltos que reporta pdf.js.
        let text = "";
        for (const item of content.items as Array<{ str?: string; hasEOL?: boolean }>) {
          if (typeof item.str !== "string") continue;
          text += item.str;
          text += item.hasEOL ? "\n" : " ";
        }
        text = normalizeText(text);
        if (text.replace(/\s/g, "").length < MIN_NATIVE_TEXT_CHARS) {
          if (!worker) {
            const { createWorker } = await import("tesseract.js");
            worker = (await createWorker(["spa", "eng"])) as unknown as OcrWorker;
          }
          const recognized = await ocrPage(page, worker);
          if (recognized.length > text.length) text = recognized;
          if (recognized) ocrPageCount += 1;
        }
        pages.push({ pageNumber: i, text });
        page.cleanup();
        onProgress?.(i / doc.numPages);
      }
    } finally {
      await worker?.terminate().catch(() => undefined);
    }
    void doc.destroy();
    return { pages, ocrPageCount };
  },
};

export const textParser: DocumentParser = {
  id: "text",
  supports: (file) => {
    const kind = detectKind(file);
    return kind === "txt" || kind === "md";
  },
  async parse(file, onProgress) {
    const text = await file.text();
    onProgress?.(1);
    return paginateText(text);
  },
};

export const PARSERS: DocumentParser[] = [pdfParser, textParser];

export function resolveParser(file: File): DocumentParser | null {
  return PARSERS.find((parser) => parser.supports(file)) ?? null;
}

export function normalizeText(input: string): string {
  return input
    .replace(/\u00ad/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
