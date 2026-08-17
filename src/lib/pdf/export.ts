import { PDFDocument, degrees } from "pdf-lib";
import type { PageEntry, PdfSource } from "./types";
import { normalizeRotation } from "./types";

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

/** Builds a real PDF from the working page structure, preserving order + rotation. */
export async function buildPdf(
  pages: PageEntry[],
  sources: Record<string, PdfSource>,
): Promise<Uint8Array> {
  if (pages.length === 0) throw new PdfError("empty-document");
  const libDocs = await loadLibDocs(pages, sources);
  const out = await PDFDocument.create();

  for (const entry of pages) {
    const src = libDocs.get(entry.sourceId);
    if (!src) throw new PdfError("missing-source");
    const [copied] = await out.copyPages(src, [entry.sourceIndex - 1]);
    if (!copied) throw new PdfError("missing-page");
    const current = copied.getRotation().angle;
    copied.setRotation(degrees(normalizeRotation(current + entry.rotation)));


    out.addPage(copied);
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
