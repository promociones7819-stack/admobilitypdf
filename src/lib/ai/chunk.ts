// Chunk Layer — fragmentación respetando párrafos y frases.
import type { Chunk, ParsedDocument } from "./types";

const TARGET_CHARS = 900;
const MIN_CHARS = 220;
const OVERLAP_CHARS = 160;

function splitSentences(text: string): string[] {
  const parts = text.split(/(?<=[.!?:;])\s+(?=[A-ZÁÉÍÓÚÑ¿¡0-9"“(])/u);
  const out: string[] = [];
  for (const part of parts) {
    if (part.length <= TARGET_CHARS * 1.5) {
      out.push(part);
      continue;
    }
    // Frase enorme (tablas, listas sin puntuación): corta por palabras.
    let buffer = "";
    for (const word of part.split(/\s+/)) {
      if (buffer.length + word.length > TARGET_CHARS) {
        out.push(buffer.trim());
        buffer = "";
      }
      buffer += `${word} `;
    }
    if (buffer.trim()) out.push(buffer.trim());
  }
  return out.filter(Boolean);
}

export interface ChunkDraft {
  pageNumber: number;
  text: string;
  startPosition: number;
  endPosition: number;
}

/** Divide una página en fragmentos con solape, sin cortar frases. */
export function chunkPage(pageNumber: number, text: string): ChunkDraft[] {
  const clean = text.trim();
  if (!clean) return [];
  const drafts: ChunkDraft[] = [];
  const blocks = clean.split(/\n{2,}/);
  let buffer = "";
  let bufferStart = 0;
  let cursor = 0;

  const flush = () => {
    const body = buffer.trim();
    if (!body) return;
    drafts.push({
      pageNumber,
      text: body,
      startPosition: bufferStart,
      endPosition: bufferStart + body.length,
    });
    const tail = body.slice(Math.max(0, body.length - OVERLAP_CHARS));
    buffer = tail ? `${tail} ` : "";
    bufferStart = bufferStart + body.length - tail.length;
  };

  for (const block of blocks) {
    for (const sentence of splitSentences(block)) {
      if (!buffer) bufferStart = cursor;
      if (buffer.length + sentence.length > TARGET_CHARS && buffer.length >= MIN_CHARS) flush();
      buffer += `${sentence} `;
      cursor += sentence.length + 1;
    }
    buffer += "\n";
  }
  const rest = buffer.trim();
  if (rest.length) {
    drafts.push({
      pageNumber,
      text: rest,
      startPosition: bufferStart,
      endPosition: bufferStart + rest.length,
    });
  }
  return drafts;
}

export function chunkDocument(doc: ParsedDocument): ChunkDraft[] {
  return doc.pages.flatMap((page) => chunkPage(page.pageNumber, page.text));
}

export function toChunks(
  drafts: ChunkDraft[],
  meta: { notebookId: string; sourceId: string; sourceName: string },
  embeddings: Float32Array[],
): Chunk[] {
  return drafts.map((draft, index) => ({
    id: `${meta.sourceId}:${index}`,
    notebookId: meta.notebookId,
    sourceId: meta.sourceId,
    sourceName: meta.sourceName,
    pageNumber: draft.pageNumber,
    text: draft.text,
    startPosition: draft.startPosition,
    endPosition: draft.endPosition,
    embedding: Array.from(embeddings[index] ?? new Float32Array()),
  }));
}
