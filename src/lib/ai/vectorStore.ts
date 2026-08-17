// Vector Search Layer — índice local sobre IndexedDB con caché en memoria.
import { getNotebookChunks, putChunks, removeChunksBySource } from "./db";
import type { Chunk, RetrievedChunk, VectorStore } from "./types";

const cache = new Map<string, Chunk[]>();

export function invalidateNotebook(notebookId: string) {
  cache.delete(notebookId);
}

async function loadNotebook(notebookId: string): Promise<Chunk[]> {
  const cached = cache.get(notebookId);
  if (cached) return cached;
  const chunks = await getNotebookChunks(notebookId);
  cache.set(notebookId, chunks);
  return chunks;
}

export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const length = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < length; i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export const indexedDbVectorStore: VectorStore = {
  async add(chunks) {
    if (!chunks.length) return;
    await putChunks(chunks);
    invalidateNotebook(chunks[0]!.notebookId);
  },
  async removeBySource(sourceId) {
    await removeChunksBySource(sourceId);
    cache.clear();
  },
  async search(notebookId, query, topK, filter) {
    const chunks = await loadNotebook(notebookId);
    const sourceIds = filter?.sourceIds ? new Set(filter.sourceIds) : null;
    const pages = filter?.pageNumbers ? new Set(filter.pageNumbers) : null;
    const scored: RetrievedChunk[] = [];
    for (const chunk of chunks) {
      if (sourceIds && !sourceIds.has(chunk.sourceId)) continue;
      if (pages && !pages.has(chunk.pageNumber)) continue;
      scored.push({ chunk, score: cosine(query, chunk.embedding as ArrayLike<number>) });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  },
};

/** Búsqueda exacta por palabras (buscador literal). */
export async function keywordSearch(
  notebookId: string,
  query: string,
  limit = 30,
  sourceIds?: string[],
): Promise<RetrievedChunk[]> {
  const chunks = await loadNotebook(notebookId);
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const allowed = sourceIds ? new Set(sourceIds) : null;
  const out: RetrievedChunk[] = [];
  for (const chunk of chunks) {
    if (allowed && !allowed.has(chunk.sourceId)) continue;
    const haystack = chunk.text.toLowerCase();
    let score = 0;
    let from = 0;
    for (;;) {
      const at = haystack.indexOf(needle, from);
      if (at === -1) break;
      score += 1;
      from = at + needle.length;
    }
    if (score) out.push({ chunk, score });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}
