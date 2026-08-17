import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getPdfjs } from "./pdfjs";
import { buildPdf, downloadBytes, editedFileName, PdfError } from "./export";
import { makeId, normalizeRotation, type PageEntry, type PdfSource } from "./types";
import {
  DEFAULT_STYLE,
  type Annotation,
  type AnnotationStyle,
  type ImageAsset,
  type ToolId,
} from "./annotations";

const MAX_BYTES = 150 * 1024 * 1024;

/** One undoable snapshot of the working document. */
interface DocState {
  pages: PageEntry[];
  annotations: Annotation[];
}

const EMPTY_DOC: DocState = { pages: [], annotations: [] };

export function friendlyError(error: unknown): string {
  const name = (error as { name?: string })?.name ?? "";
  const message = error instanceof Error ? error.message : String(error);
  if (name === "PasswordException" || /password|encrypt/i.test(message))
    return "El archivo está protegido con contraseña.";
  if (message === "file-too-large") return "El archivo supera el tamaño permitido (150 MB).";
  if (message === "not-a-pdf") return "Solo se admiten archivos PDF.";
  if (message === "unsupported-image") return "Solo se admiten imágenes PNG o JPG.";
  if (message === "empty-document") return "El documento no tiene páginas.";
  if (error instanceof PdfError) return "No se ha podido exportar el PDF.";
  return "El PDF no se puede abrir.";
}

async function loadSource(file: File): Promise<PdfSource> {
  if (file.size > MAX_BYTES) throw new Error("file-too-large");
  if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf")
    throw new Error("not-a-pdf");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdfjs = await getPdfjs();
  const doc = await pdfjs.getDocument({ data: bytes.slice(0) }).promise;
  return { id: makeId("src"), name: file.name, bytes, doc, pageCount: doc.numPages };
}

interface EditorContextValue {
  sources: Record<string, PdfSource>;
  pages: PageEntry[];
  annotations: Annotation[];
  images: Record<string, ImageAsset>;
  fileName: string | null;
  dirty: boolean;
  busy: boolean;
  selection: string[];
  activePageId: string | null;
  canUndo: boolean;
  canRedo: boolean;
  hasDocument: boolean;
  tool: ToolId;
  style: AnnotationStyle;
  selectedAnnotationId: string | null;
  setTool: (tool: ToolId) => void;
  setStyle: (patch: Partial<AnnotationStyle>) => void;
  setSelectedAnnotation: (id: string | null) => void;
  addAnnotation: (annotation: Annotation) => void;
  updateAnnotation: (id: string, patch: Partial<Annotation>) => void;
  deleteAnnotation: (id: string) => void;
  clearPageAnnotations: (pageId: string) => void;
  addImageAsset: (asset: ImageAsset) => void;
  openFiles: (files: File[]) => Promise<void>;
  importFiles: (files: File[], insertAfterPageId?: string | null) => Promise<void>;
  closeDocument: () => void;
  setSelection: (ids: string[]) => void;
  setActivePage: (id: string) => void;
  toggleSelection: (id: string, additive: boolean) => void;
  deletePages: (ids: string[]) => void;
  duplicatePages: (ids: string[]) => void;
  rotatePages: (ids: string[], delta: number) => void;
  movePage: (id: string, targetIndex: number) => void;
  undo: () => void;
  redo: () => void;
  download: () => Promise<void>;
  extractPages: (ids: string[]) => Promise<void>;
  markSaved: () => void;
}

const EditorContext = createContext<EditorContextValue | null>(null);

export function PdfEditorProvider({ children }: { children: ReactNode }) {
  const [sources, setSources] = useState<Record<string, PdfSource>>({});
  const [images, setImages] = useState<Record<string, ImageAsset>>({});
  const [history, setHistory] = useState<DocState[]>([EMPTY_DOC]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [savedIndex, setSavedIndex] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const [selection, setSelectionState] = useState<string[]>([]);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tool, setToolState] = useState<ToolId>("select");
  const [style, setStyleState] = useState<AnnotationStyle>(DEFAULT_STYLE);
  const [selectedAnnotationId, setSelectedAnnotation] = useState<string | null>(null);

  const doc = history[historyIndex] ?? EMPTY_DOC;
  const pages = doc.pages;
  const annotations = doc.annotations;

  const commit = useCallback(
    (updater: (current: DocState) => DocState) => {
      setHistory((prev) => {
        const index = prev.length - 1;
        void index;
        return prev;
      });
      setHistory((prev) => {
        const current = prev[historyIndex] ?? EMPTY_DOC;
        return [...prev.slice(0, historyIndex + 1), updater(current)];
      });
      setHistoryIndex((i) => i + 1);
    },
    [historyIndex],
  );

  const resetHistory = useCallback((next: DocState) => {
    setHistory([next]);
    setHistoryIndex(0);
    setSavedIndex(0);
  }, []);

  const pagesFromSource = (source: PdfSource): PageEntry[] =>
    Array.from({ length: source.pageCount }, (_, i) => ({
      id: makeId("pg"),
      sourceId: source.id,
      sourceIndex: i + 1,
      rotation: 0,
    }));

  const openFiles = useCallback(
    async (files: File[]) => {
      setBusy(true);
      try {
        const loaded: PdfSource[] = [];
        for (const file of files) loaded.push(await loadSource(file));
        const nextSources: Record<string, PdfSource> = {};
        for (const s of loaded) nextSources[s.id] = s;
        const nextPages = loaded.flatMap(pagesFromSource);
        setSources(nextSources);
        resetHistory({ pages: nextPages, annotations: [] });
        setFileName(
          loaded.length === 1 ? (loaded[0]?.name ?? null) : "documento-combinado.pdf",
        );
        setSelectionState(nextPages[0] ? [nextPages[0].id] : []);
        setActivePageId(nextPages[0]?.id ?? null);
        setSelectedAnnotation(null);
        setToolState("select");
      } finally {
        setBusy(false);
      }
    },
    [resetHistory],
  );

  const importFiles = useCallback(
    async (files: File[], insertAfterPageId?: string | null) => {
      setBusy(true);
      try {
        const loaded: PdfSource[] = [];
        for (const file of files) loaded.push(await loadSource(file));
        setSources((prev) => {
          const next = { ...prev };
          for (const s of loaded) next[s.id] = s;
          return next;
        });
        const newPages = loaded.flatMap(pagesFromSource);
        const at = insertAfterPageId
          ? pages.findIndex((p) => p.id === insertAfterPageId) + 1
          : pages.length;
        commit((current) => ({
          ...current,
          pages: [
            ...current.pages.slice(0, at),
            ...newPages,
            ...current.pages.slice(at),
          ],
        }));
        if (newPages[0]) {
          setSelectionState([newPages[0].id]);
          setActivePageId(newPages[0].id);
        }
      } finally {
        setBusy(false);
      }
    },
    [commit, pages],
  );

  const closeDocument = useCallback(() => {
    setSources({});
    setImages({});
    resetHistory(EMPTY_DOC);
    setFileName(null);
    setSelectionState([]);
    setActivePageId(null);
    setSelectedAnnotation(null);
    setToolState("select");
  }, [resetHistory]);

  const deletePages = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      const nextPages = pages.filter((p) => !ids.includes(p.id));
      commit((current) => ({
        pages: current.pages.filter((p) => !ids.includes(p.id)),
        annotations: current.annotations.filter((a) => !ids.includes(a.pageId)),
      }));
      const nextActive =
        activePageId && nextPages.some((p) => p.id === activePageId)
          ? activePageId
          : (nextPages[0]?.id ?? null);
      setActivePageId(nextActive);
      setSelectionState(nextActive ? [nextActive] : []);
      setSelectedAnnotation(null);
    },
    [activePageId, commit, pages],
  );

  const duplicatePages = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      commit((current) => {
        const nextPages: PageEntry[] = [];
        const nextAnnotations = [...current.annotations];
        for (const page of current.pages) {
          nextPages.push(page);
          if (ids.includes(page.id)) {
            const cloneId = makeId("pg");
            nextPages.push({ ...page, id: cloneId });
            for (const annotation of current.annotations) {
              if (annotation.pageId === page.id)
                nextAnnotations.push({ ...annotation, id: makeId("ann"), pageId: cloneId });
            }
          }
        }
        return { pages: nextPages, annotations: nextAnnotations };
      });
    },
    [commit],
  );

  const rotatePages = useCallback(
    (ids: string[], delta: number) => {
      if (ids.length === 0) return;
      commit((current) => ({
        ...current,
        pages: current.pages.map((p) =>
          ids.includes(p.id) ? { ...p, rotation: normalizeRotation(p.rotation + delta) } : p,
        ),
      }));
    },
    [commit],
  );

  const movePage = useCallback(
    (id: string, targetIndex: number) => {
      const from = pages.findIndex((p) => p.id === id);
      if (from === -1) return;
      const clamped = Math.max(0, Math.min(targetIndex, pages.length - 1 + 1));
      if (clamped === from || clamped === from + 1) return;
      commit((current) => {
        const index = current.pages.findIndex((p) => p.id === id);
        if (index === -1) return current;
        const moved = current.pages[index]!;
        const without = current.pages.filter((_, i) => i !== index);
        const at = Math.max(0, Math.min(clamped > index ? clamped - 1 : clamped, without.length));
        return {
          ...current,
          pages: [...without.slice(0, at), moved, ...without.slice(at)],
        };
      });
    },
    [commit, pages],
  );

  const addAnnotation = useCallback(
    (annotation: Annotation) => {
      commit((current) => ({
        ...current,
        annotations: [...current.annotations, annotation],
      }));
      setSelectedAnnotation(annotation.id);
    },
    [commit],
  );

  const updateAnnotation = useCallback(
    (id: string, patch: Partial<Annotation>) => {
      commit((current) => ({
        ...current,
        annotations: current.annotations.map((a) => (a.id === id ? { ...a, ...patch } : a)),
      }));
    },
    [commit],
  );

  const deleteAnnotation = useCallback(
    (id: string) => {
      commit((current) => ({
        ...current,
        annotations: current.annotations.filter((a) => a.id !== id),
      }));
      setSelectedAnnotation(null);
    },
    [commit],
  );

  const clearPageAnnotations = useCallback(
    (pageId: string) => {
      commit((current) => ({
        ...current,
        annotations: current.annotations.filter((a) => a.pageId !== pageId),
      }));
      setSelectedAnnotation(null);
    },
    [commit],
  );

  const addImageAsset = useCallback((asset: ImageAsset) => {
    setImages((prev) => ({ ...prev, [asset.id]: asset }));
  }, []);

  const undo = useCallback(() => {
    setSelectedAnnotation(null);
    setHistoryIndex((i) => Math.max(0, i - 1));
  }, []);
  const redo = useCallback(() => {
    setSelectedAnnotation(null);
    setHistoryIndex((i) => Math.min(history.length - 1, i + 1));
  }, [history.length]);

  const download = useCallback(async () => {
    setBusy(true);
    try {
      const bytes = await buildPdf(pages, sources, { annotations, images });
      downloadBytes(bytes, editedFileName(fileName));
      setSavedIndex(historyIndex);
    } finally {
      setBusy(false);
    }
  }, [annotations, fileName, historyIndex, images, pages, sources]);

  const extractPages = useCallback(
    async (ids: string[]) => {
      setBusy(true);
      try {
        const subset = pages.filter((p) => ids.includes(p.id));
        const bytes = await buildPdf(subset, sources, { annotations, images });
        const base = (fileName ?? "documento").replace(/\.pdf$/i, "");
        downloadBytes(bytes, `${base}-extraido.pdf`);
      } finally {
        setBusy(false);
      }
    },
    [annotations, fileName, images, pages, sources],
  );

  const toggleSelection = useCallback((id: string, additive: boolean) => {
    setSelectionState((prev) => {
      if (!additive) return [id];
      return prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id];
    });
    setActivePageId(id);
  }, []);

  const setTool = useCallback((next: ToolId) => {
    setToolState(next);
    if (next !== "select") setSelectedAnnotation(null);
  }, []);

  const setStyle = useCallback((patch: Partial<AnnotationStyle>) => {
    setStyleState((prev) => ({ ...prev, ...patch }));
  }, []);

  const value = useMemo<EditorContextValue>(
    () => ({
      sources,
      pages,
      annotations,
      images,
      fileName,
      dirty: historyIndex !== savedIndex,
      busy,
      selection,
      activePageId,
      canUndo: historyIndex > 0,
      canRedo: historyIndex < history.length - 1,
      hasDocument: pages.length > 0,
      tool,
      style,
      selectedAnnotationId,
      setTool,
      setStyle,
      setSelectedAnnotation,
      addAnnotation,
      updateAnnotation,
      deleteAnnotation,
      clearPageAnnotations,
      addImageAsset,
      openFiles,
      importFiles,
      closeDocument,
      setSelection: setSelectionState,
      setActivePage: (id: string) => {
        setActivePageId(id);
        setSelectionState([id]);
        setSelectedAnnotation(null);
      },
      toggleSelection,
      deletePages,
      duplicatePages,
      rotatePages,
      movePage,
      undo,
      redo,
      download,
      extractPages,
      markSaved: () => setSavedIndex(historyIndex),
    }),
    [
      activePageId,
      addAnnotation,
      addImageAsset,
      annotations,
      busy,
      clearPageAnnotations,
      closeDocument,
      deleteAnnotation,
      deletePages,
      download,
      duplicatePages,
      extractPages,
      fileName,
      history.length,
      historyIndex,
      images,
      importFiles,
      movePage,
      openFiles,
      pages,
      redo,
      rotatePages,
      savedIndex,
      selectedAnnotationId,
      selection,
      setStyle,
      setTool,
      sources,
      style,
      toggleSelection,
      tool,
      undo,
      updateAnnotation,
    ],
  );

  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}

export function usePdfEditor(): EditorContextValue {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error("usePdfEditor must be used inside PdfEditorProvider");
  return ctx;
}
