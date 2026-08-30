// ============================================================================
// AI Layer — contratos (interfaces) del sistema de IA local sobre documentos.
// Ninguna capa depende de un motor concreto: cada una define su interfaz para
// poder sustituir el parser, el modelo de embeddings, el índice o el LLM.
// ============================================================================

export type SourceKind = "pdf" | "txt" | "md" | "docx" | "image" | "epub" | "url";

export type SourceStatus = "pending" | "processing" | "ready" | "error";

export interface Notebook {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Source {
  id: string;
  notebookId: string;
  name: string;
  kind: SourceKind;
  status: SourceStatus;
  error?: string;
  pageCount: number;
  chunkCount: number;
  addedAt: number;
  /** Bytes originales para poder abrir el documento en el editor (solo PDF). */
  hasBytes: boolean;
  /** Excluir de la recuperación sin borrar la fuente. */
  enabled: boolean;
  /** Páginas que necesitaron OCR porque el PDF no contenía texto utilizable. */
  ocrPageCount?: number;
}

export interface Chunk {
  id: string;
  notebookId: string;
  sourceId: string;
  sourceName: string;
  pageNumber: number;
  text: string;
  startPosition: number;
  endPosition: number;
  embedding: Float32Array | number[];
}

/** Texto extraído de un documento, por páginas. */
export interface ParsedPage {
  pageNumber: number;
  text: string;
}

export interface ParsedDocument {
  pages: ParsedPage[];
  ocrPageCount?: number;
}

export interface DocumentParser {
  id: string;
  supports: (file: File) => boolean;
  parse: (file: File, onProgress?: (ratio: number) => void) => Promise<ParsedDocument>;
}

export interface EmbeddingProvider {
  id: string;
  /** Dimensión del vector resultante. */
  dimensions: number;
  /** Etiqueta legible del motor en uso (para la UI). */
  label: string;
  ready: () => Promise<void>;
  embed: (
    texts: string[],
    onProgress?: (ratio: number) => void,
    task?: "query" | "document",
  ) => Promise<Float32Array[]>;
}

export interface RetrievedChunk {
  chunk: Chunk;
  score: number;
}

export interface VectorStore {
  add: (chunks: Chunk[]) => Promise<void>;
  removeBySource: (sourceId: string) => Promise<void>;
  search: (
    notebookId: string,
    query: Float32Array,
    topK: number,
    filter?: { sourceIds?: string[]; pageNumbers?: number[] },
  ) => Promise<RetrievedChunk[]>;
}

export interface Citation {
  index: number;
  sourceId: string;
  sourceName: string;
  pageNumber: number;
  snippet: string;
}

export type AnswerMode = "sources-only" | "general" | "compare";

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmProvider {
  id: string;
  label: string;
  /** ¿Puede generar ya mismo, sin descargas? */
  isReady: () => boolean;
  /** Genera texto en streaming. Devuelve el texto completo. */
  generate: (
    messages: LlmMessage[],
    onToken: (delta: string) => void,
    signal?: AbortSignal,
  ) => Promise<string>;
}

export interface ChatTurn {
  id: string;
  notebookId: string;
  role: "user" | "assistant";
  content: string;
  citations: Citation[];
  createdAt: number;
  mode?: AnswerMode;
}

export interface RetrievalScope {
  kind: "page" | "document" | "all";
  sourceId?: string;
  pageNumber?: number;
}
