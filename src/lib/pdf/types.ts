import type { PDFDocumentProxy } from "pdfjs-dist";

/** A loaded source PDF file. Sources are immutable: the user's original bytes. */
export interface PdfSource {
  id: string;
  name: string;
  /** Untouched copy of the original bytes, used by pdf-lib on export. */
  bytes: Uint8Array;
  /** pdf.js document proxy used for rendering. */
  doc: PDFDocumentProxy;
  pageCount: number;
}

/**
 * One page of the working document. `id` is stable and unique for the whole
 * session: page order can change, so the index is never an identity.
 */
export interface PageEntry {
  id: string;
  sourceId: string;
  /** 1-based page index inside the source document. */
  sourceIndex: number;
  /** Extra rotation applied by the user, added to the page's intrinsic rotation. */
  rotation: number;
}

export interface AnnotationBase {
  id: string;
  pageId: string;
  /** Relative coordinates (0..1) against the unrotated page box. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export function normalizeRotation(value: number): number {
  return ((value % 360) + 360) % 360;
}

export function makeId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}
