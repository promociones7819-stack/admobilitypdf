// Retrieval Layer — orquesta el flujo RAG completo:
// documento → texto → chunks → embeddings → índice → búsqueda → LLM → citas.
import { chunkDocument, toChunks } from "./chunk";
import { getEmbedder } from "./embeddings";
import { getNotebookChunks, putSource, putSourceBytes } from "./db";
import { detectKind, resolveParser } from "./parsers";
import { buildCitations, buildContext, systemPrompt } from "./prompt";
import { indexedDbVectorStore, keywordSearch } from "./vectorStore";
import type {
  AnswerMode,
  Citation,
  LlmMessage,
  LlmProvider,
  RetrievalScope,
  RetrievedChunk,
  Source,
} from "./types";

export type IngestStep = "reading" | "extracting" | "chunking" | "embedding" | "indexing" | "done";

export interface IngestProgress {
  step: IngestStep;
  ratio: number;
}

export const STEP_LABEL: Record<IngestStep, string> = {
  reading: "Leyendo documento",
  extracting: "Extrayendo texto",
  chunking: "Dividiendo contenido",
  embedding: "Creando embeddings",
  indexing: "Indexando",
  done: "Completado",
};

/** Recalcula el índice del cuaderno al cambiar de modelo de embeddings. */
export async function reindexNotebook(
  notebookId: string,
  onProgress?: (ratio: number) => void,
): Promise<number> {
  const chunks = await getNotebookChunks(notebookId);
  if (!chunks.length) {
    onProgress?.(1);
    return 0;
  }
  const embedder = getEmbedder();
  await embedder.ready();
  const vectors = await embedder.embed(
    chunks.map((chunk) => chunk.text),
    onProgress,
    "document",
  );
  await indexedDbVectorStore.add(
    chunks.map((chunk, index) => ({ ...chunk, embedding: vectors[index] ?? chunk.embedding })),
  );
  return chunks.length;
}

function makeId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

export async function ingestFile(
  notebookId: string,
  file: File,
  onProgress: (progress: IngestProgress) => void,
  onSource?: (source: Source) => void,
): Promise<Source> {
  const kind = detectKind(file);
  const parser = kind ? resolveParser(file) : null;
  const source: Source = {
    id: makeId("src"),
    notebookId,
    name: file.name,
    kind: kind ?? "txt",
    status: "processing",
    pageCount: 0,
    chunkCount: 0,
    addedAt: Date.now(),
    hasBytes: kind === "pdf",
    enabled: true,
  };
  await putSource(source);
  onSource?.(source);

  if (!parser) {
    const failed: Source = { ...source, status: "error", error: "Formato no compatible" };
    await putSource(failed);
    onSource?.(failed);
    throw new Error("unsupported-format");
  }

  try {
    onProgress({ step: "reading", ratio: 0.05 });
    if (kind === "pdf") await putSourceBytes(source.id, new Uint8Array(await file.arrayBuffer()));

    const parsed = await parser.parse(file, (ratio) =>
      onProgress({ step: "extracting", ratio: 0.1 + ratio * 0.35 }),
    );

    onProgress({ step: "chunking", ratio: 0.5 });
    const drafts = chunkDocument(parsed);
    if (!drafts.length) throw new Error("no-text");

    const embedder = getEmbedder();
    await embedder.ready();
    const vectors = await embedder.embed(
      drafts.map((draft) => draft.text),
      (ratio) => onProgress({ step: "embedding", ratio: 0.55 + ratio * 0.35 }),
      "document",
    );

    onProgress({ step: "indexing", ratio: 0.92 });
    const chunks = toChunks(
      drafts,
      { notebookId, sourceId: source.id, sourceName: source.name },
      vectors,
    );
    await indexedDbVectorStore.add(chunks);

    const ready: Source = {
      ...source,
      status: "ready",
      pageCount: parsed.pages.length,
      chunkCount: chunks.length,
      ocrPageCount: parsed.ocrPageCount ?? 0,
    };
    await putSource(ready);
    onSource?.(ready);
    onProgress({ step: "done", ratio: 1 });
    return ready;
  } catch (error) {
    const failed: Source = {
      ...source,
      status: "error",
      error: error instanceof Error ? error.message : "error",
    };
    await putSource(failed);
    onSource?.(failed);
    throw error;
  }
}

export async function retrieve(
  notebookId: string,
  question: string,
  options: { topK?: number; sourceIds?: string[]; scope?: RetrievalScope } = {},
): Promise<RetrievedChunk[]> {
  const embedder = getEmbedder();
  await embedder.ready();
  const [queryVector] = await embedder.embed([question], undefined, "query");
  if (!queryVector) return [];
  const scope = options.scope;
  const pageNumbers =
    scope?.kind === "page" && scope.pageNumber
      ? [scope.pageNumber - 1, scope.pageNumber, scope.pageNumber + 1].filter((page) => page > 0)
      : undefined;
  const sourceIds =
    scope && scope.kind !== "all" && scope.sourceId ? [scope.sourceId] : options.sourceIds;
  const topK = options.topK ?? 6;
  const [semantic, lexical] = await Promise.all([
    indexedDbVectorStore.search(notebookId, queryVector, topK * 2, {
      ...(sourceIds ? { sourceIds } : {}),
      ...(pageNumbers ? { pageNumbers } : {}),
    }),
    keywordSearch(notebookId, question, topK * 2, sourceIds, pageNumbers),
  ]);
  // Recuperación híbrida: E5 encuentra conceptos equivalentes y la rama
  // léxica protege nombres, cifras y términos exactos frecuentes en apuntes.
  const merged = new Map<string, RetrievedChunk>();
  semantic.forEach((item, index) =>
    merged.set(item.chunk.id, { ...item, score: item.score * 0.75 + 0.25 / (index + 1) }),
  );
  lexical.forEach((item, index) => {
    const previous = merged.get(item.chunk.id);
    const boost = 0.35 / (index + 1);
    merged.set(item.chunk.id, {
      chunk: item.chunk,
      score: (previous?.score ?? 0) + boost,
    });
  });
  return [...merged.values()]
    .filter((item) => item.score > 0.05)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

export interface AskResult {
  answer: string;
  citations: Citation[];
  retrieved: RetrievedChunk[];
}

export async function askWithSources(params: {
  provider: LlmProvider;
  notebookId: string;
  question: string;
  mode: AnswerMode;
  history?: LlmMessage[];
  sourceIds?: string[];
  scope?: RetrievalScope;
  topK?: number;
  onToken?: (delta: string) => void;
  signal?: AbortSignal;
}): Promise<AskResult> {
  const retrieved = await retrieve(params.notebookId, params.question, {
    topK: params.topK ?? (params.mode === "compare" ? 10 : 6),
    ...(params.sourceIds ? { sourceIds: params.sourceIds } : {}),
    ...(params.scope ? { scope: params.scope } : {}),
  });
  const citations = buildCitations(retrieved);
  const context = buildContext(retrieved);

  if (!retrieved.length && params.mode !== "general") {
    const answer = "No encuentro esa información en las fuentes seleccionadas.";
    params.onToken?.(answer);
    return { answer, citations: [], retrieved };
  }

  const messages: LlmMessage[] = [
    { role: "system", content: systemPrompt(params.mode) },
    ...(params.history ?? []),
    {
      role: "user",
      content: `CONTEXTO:\n${context}\n\nPREGUNTA: ${params.question}`,
    },
  ];

  const answer = await params.provider.generate(
    messages,
    (delta) => params.onToken?.(delta),
    params.signal,
  );
  const used = new Set(Array.from(answer.matchAll(/\[(\d+)\]/g)).map((match) => Number(match[1])));
  const filtered = used.size
    ? citations.filter((citation) => used.has(citation.index))
    : citations.slice(0, 4);
  return { answer, citations: filtered, retrieved };
}
