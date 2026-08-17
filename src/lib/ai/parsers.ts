// Document Layer — extracción de texto por páginas. Ampliable con nuevos
// parsers (DOCX, EPUB, imágenes con OCR, URLs) implementando DocumentParser.
import { getPdfjs } from "@/lib/pdf/pdfjs";
import type { DocumentParser, ParsedDocument, SourceKind } from "./types";

export function detectKind(file: File): SourceKind | null {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf") || file.type === "application/pdf") return "pdf";
  if (name.endsWith(".md") || name.endsWith(".markdown")) return "md";
  if (name.endsWith(".txt") || file.type.startsWith("text/")) return "txt";
  return null;
}

const PAGE_CHARS = 3000;

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
      pages.push({ pageNumber: i, text: normalizeText(text) });
      page.cleanup();
      onProgress?.(i / doc.numPages);
    }
    void doc.destroy();
    return { pages };
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
