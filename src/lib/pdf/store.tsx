import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getPdfjs } from "./pdfjs";
import { buildPdf, downloadBytes, editedFileName, PdfError } from "./export";
import { makeId, normalizeRotation, type PageEntry, type PdfSource } from "./types";

const MAX_BYTES = 150 * 1024 * 1024;

export function friendlyError(error: unknown): string {
  const name = (error as { name?: string })?.name ?? "";
  const message = error instanceof Error ? error.message : String(error);
  if (name === "PasswordException" || /password|encrypt/i.test(message))
    return "El archivo está protegido con contraseña.";
  if (message === "file-too-large") return "El archivo supera el tamaño permitido (150 MB).";
  if (message === "not-a-pdf") return "Solo se admiten archivos PDF.";
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
  return {
    id: makeId("src"),
    name: file.name,
    bytes,
    doc,
    pageCount: doc.numPages,
  };
}

interface EditorContextValue {
  sources: Record<string, PdfSource>;
  pages: PageEntry[];
  fileName: string | null;
  dirty: boolean;
  busy: boolean;
  selection: string[];
  activePageId: string | null;
  canUndo: boolean;
  canRedo: boolean;
  hasDocument: boolean;
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
  const [history, setHistory] = useState<PageEntry[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [savedIndex, setSavedIndex] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const [selection, setSelectionState] = useState<string[]>([]);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const selectionRef = useRef<string[]>([]);
  selectionRef.current = selection;

  const pages = history[historyIndex] ?? [];

  const commit = useCallback(
    (next: PageEntry[]) => {
      setHistory((prev) => [...prev.slice(0, historyIndex + 1), next]);
      setHistoryIndex((i) => i + 1);
    },
    [historyIndex],
  );

  const resetHistory = useCallback((next: PageEntry[]) => {
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
        resetHistory(nextPages);
        setFileName(
          loaded.length === 1 ? (loaded[0]?.name ?? null) : "documento-combinado.pdf",
        );
        setSelectionState(nextPages[0] ? [nextPages[0].id] : []);
        setActivePageId(nextPages[0]?.id ?? null);
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
        const current = history[historyIndex] ?? [];
        const at = insertAfterPageId
          ? current.findIndex((p) => p.id === insertAfterPageId) + 1
          : current.length;
        const next = [...current.slice(0, at), ...newPages, ...current.slice(at)];
        commit(next);
        if (newPages[0]) {
          setSelectionState([newPages[0].id]);
          setActivePageId(newPages[0].id);
        }
      } finally {
        setBusy(false);
      }
    },
    [commit, history, historyIndex],
  );

  const closeDocument = useCallback(() => {
    setSources({});
    resetHistory([]);
    setFileName(null);
    setSelectionState([]);
    setActivePageId(null);
  }, [resetHistory]);

  const ensureActive = useCallback((next: PageEntry[], previousActive: string | null) => {
    if (previousActive && next.some((p) => p.id === previousActive)) return previousActive;
    return next[0]?.id ?? null;
  }, []);

  const deletePages = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      const current = history[historyIndex] ?? [];
      const next = current.filter((p) => !ids.includes(p.id));
      commit(next);
      const nextActive = ensureActive(next, activePageId);
      setActivePageId(nextActive);
      setSelectionState(nextActive ? [nextActive] : []);
    },
    [activePageId, commit, ensureActive, history, historyIndex],
  );

  const duplicatePages = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      const current = history[historyIndex] ?? [];
      const next: PageEntry[] = [];
      for (const page of current) {
        next.push(page);
        if (ids.includes(page.id)) next.push({ ...page, id: makeId("pg") });
      }
      commit(next);
    },
    [commit, history, historyIndex],
  );

  const rotatePages = useCallback(
    (ids: string[], delta: number) => {
      if (ids.length === 0) return;
      const current = history[historyIndex] ?? [];
      commit(
        current.map((p) =>
          ids.includes(p.id) ? { ...p, rotation: normalizeRotation(p.rotation + delta) } : p,
        ),
      );
    },
    [commit, history, historyIndex],
  );

  const movePage = useCallback(
    (id: string, targetIndex: number) => {
      const current = history[historyIndex] ?? [];
      const from = current.findIndex((p) => p.id === id);
      if (from === -1) return;
      const moved = current[from]!;
      const without = current.filter((_, i) => i !== from);
      const clamped = Math.max(0, Math.min(targetIndex, without.length));
      if (clamped === from) return;
      commit([...without.slice(0, clamped), moved, ...without.slice(clamped)]);
    },
    [commit, history, historyIndex],
  );

  const undo = useCallback(() => setHistoryIndex((i) => Math.max(0, i - 1)), []);
  const redo = useCallback(
    () => setHistoryIndex((i) => Math.min(history.length - 1, i + 1)),
    [history.length],
  );

  const download = useCallback(async () => {
    setBusy(true);
    try {
      const bytes = await buildPdf(history[historyIndex] ?? [], sources);
      downloadBytes(bytes, editedFileName(fileName));
      setSavedIndex(historyIndex);
    } finally {
      setBusy(false);
    }
  }, [fileName, history, historyIndex, sources]);

  const extractPages = useCallback(
    async (ids: string[]) => {
      setBusy(true);
      try {
        const current = history[historyIndex] ?? [];
        const subset = current.filter((p) => ids.includes(p.id));
        const bytes = await buildPdf(subset, sources);
        const base = (fileName ?? "documento").replace(/\.pdf$/i, "");
        downloadBytes(bytes, `${base}-extraido.pdf`);
      } finally {
        setBusy(false);
      }
    },
    [fileName, history, historyIndex, sources],
  );

  const toggleSelection = useCallback((id: string, additive: boolean) => {
    setSelectionState((prev) => {
      if (!additive) return [id];
      return prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id];
    });
    setActivePageId(id);
  }, []);

  const value = useMemo<EditorContextValue>(
    () => ({
      sources,
      pages,
      fileName,
      dirty: historyIndex !== savedIndex,
      busy,
      selection,
      activePageId,
      canUndo: historyIndex > 0,
      canRedo: historyIndex < history.length - 1,
      hasDocument: pages.length > 0,
      openFiles,
      importFiles,
      closeDocument,
      setSelection: setSelectionState,
      setActivePage: (id: string) => {
        setActivePageId(id);
        setSelectionState([id]);
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
      busy,
      closeDocument,
      deletePages,
      download,
      duplicatePages,
      extractPages,
      fileName,
      history.length,
      historyIndex,
      importFiles,
      movePage,
      openFiles,
      pages,
      redo,
      rotatePages,
      savedIndex,
      selection,
      sources,
      toggleSelection,
      undo,
    ],
  );

  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}

export function usePdfEditor(): EditorContextValue {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error("usePdfEditor must be used inside PdfEditorProvider");
  return ctx;
}
