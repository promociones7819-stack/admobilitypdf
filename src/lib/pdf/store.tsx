import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getPdfjs } from "./pdfjs";
import { toast } from "sonner";
import { buildPdf, downloadBytes, editedFileName, getFontFallbacks, PdfError } from "./export";
import { getPageSize } from "./render";
import {
  A4,
  BLANK_SOURCE_ID,
  makeId,
  normalizeRotation,
  type PageEntry,
  type PdfSource,
} from "./types";

import {
  DEFAULT_STYLE,
  type Annotation,
  type AnnotationStyle,
  type ImageAsset,
  type ToolId,
} from "./annotations";
import type { CoverExportMode } from "./export";
import {
  clearRecovery,
  createWorkspaceSnapshot,
  getRecoveryInfo,
  loadRecovery,
  saveRecovery,
  type WorkspaceSnapshot,
} from "./recovery";
import {
  getActiveProjectWorkspaceInfo,
  loadWorkspaceFromActiveProject,
  saveWorkspaceToActiveProject,
  saveProjectVersion,
  listProjectVersions,
  loadProjectVersion,
  type ProjectVersionInfo,
} from "@/lib/projects/storage";
import { flattenForSecureRedaction } from "./security";

const MAX_BYTES = 150 * 1024 * 1024;
const MAX_HISTORY = 100;

/** One undoable snapshot of the working document. */
interface DocState {
  pages: PageEntry[];
  annotations: Annotation[];
}

const EMPTY_DOC: DocState = { pages: [], annotations: [] };

export function friendlyError(error: unknown): string {
  const name = (error as { name?: string })?.name ?? "";
  const message = error instanceof Error ? error.message : String(error);
  console.error("[pdf] error", name, message, error);
  if (name === "PasswordException" || /password|encrypt/i.test(message))
    return "El archivo está protegido con contraseña.";
  if (message === "file-too-large") return "El archivo supera el tamaño permitido (150 MB).";
  if (message === "not-a-pdf") return "Solo se admiten archivos PDF.";
  if (message === "empty-file")
    return "El archivo está vacío o no se ha podido leer del todo (prueba a descargarlo antes desde Archivos/iCloud).";
  if (message === "unsupported-image") return "Solo se admiten imágenes PNG o JPG.";
  if (message === "empty-document") return "El documento no tiene páginas.";
  if (message === "invalid-pdf")
    return "El archivo está dañado o usa una estructura PDF no compatible. Prueba a abrirlo y volverlo a guardar desde Archivos o Vista Previa.";
  if (error instanceof PdfError) {
    if (message === "corrupt-source")
      return "Uno de los PDF está dañado y no se puede combinar. Ábrelo y vuelve a guardarlo desde Archivos o Vista Previa antes de intentarlo de nuevo.";
    return "No se ha podido exportar el PDF.";
  }
  return `El PDF no se puede abrir${message ? ` (${message})` : ""}.`;
}

/** Rebuilds a damaged PDF with pdf-lib so pdf.js can open it. */
async function repairBytes(bytes: Uint8Array): Promise<Uint8Array> {
  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.load(bytes.slice(0), {
    ignoreEncryption: true,
    throwOnInvalidObject: false,
    updateMetadata: false,
  });
  return doc.save({ useObjectStreams: false });
}

async function loadSource(file: File, sourceId?: string): Promise<PdfSource> {
  const looksPdf = /\.pdf$/i.test(file.name) || file.type === "application/pdf";

  let bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength === 0) throw new Error("empty-file");
  const header = new TextDecoder().decode(bytes.slice(0, 1024));
  if (!looksPdf && !header.includes("%PDF")) throw new Error("not-a-pdf");
  const pdfjs = await getPdfjs();

  const openBytes = (data: Uint8Array) =>
    pdfjs.getDocument({ data: data.slice(0), stopAtErrors: false }).promise;

  // WebKit on iPad can fail while transferring a large Uint8Array to the
  // pdf.js worker. Loading the same File through a Blob URL avoids that copy.
  const openFileUrl = async () => {
    const url = URL.createObjectURL(file);
    try {
      return await pdfjs.getDocument({ url, stopAtErrors: false }).promise;
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  let doc;
  let firstError: unknown;
  try {
    doc = await openFileUrl();
  } catch (error) {
    firstError = error;
    const name = (error as { name?: string })?.name ?? "";
    if (name === "PasswordException") throw error;
    try {
      doc = await openBytes(bytes);
    } catch (bytesError) {
      const bytesErrorName = (bytesError as { name?: string })?.name ?? "";
      if (bytesErrorName === "PasswordException") throw bytesError;

      // Some generators leave a damaged cross-reference table. pdf-lib can
      // rebuild those files, but it cannot repair every malformed object. Keep
      // that failure isolated so its minified type error is never shown.
      try {
        console.warn("[pdf] reintentando tras reparar el archivo", bytesError);
        const repaired = new Uint8Array(await repairBytes(bytes));
        doc = await openBytes(repaired);
        bytes = repaired;
      } catch (repairError) {
        console.error("[pdf] fallaron apertura y reparación", {
          firstError,
          bytesError,
          repairError,
        });
        throw new Error("invalid-pdf");
      }
    }
  }
  return { id: sourceId ?? makeId("src"), name: file.name, bytes, doc, pageCount: doc.numPages };
}

function destroySources(sources: Record<string, PdfSource>): void {
  for (const source of Object.values(sources)) void source.doc.destroy().catch(() => undefined);
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
  selectedAnnotationIds: string[];
  setTool: (tool: ToolId) => void;
  setStyle: (patch: Partial<AnnotationStyle>) => void;
  setSelectedAnnotation: (id: string | null) => void;
  setSelectedAnnotations: (ids: string[]) => void;
  toggleAnnotationSelection: (id: string, additive?: boolean) => void;
  addAnnotation: (annotation: Annotation) => void;
  updateAnnotation: (id: string, patch: Partial<Annotation>) => void;
  updateAnnotations: (ids: string[], patch: Partial<Annotation>) => void;
  moveAnnotations: (ids: string[], dx: number, dy: number) => void;
  deleteAnnotation: (id: string) => void;
  deleteAnnotations: (ids: string[]) => void;
  duplicateAnnotation: (id: string) => void;
  reorderAnnotation: (id: string, direction: "front" | "forward" | "backward" | "back") => void;
  alignAnnotations: (
    ids: string[],
    mode: "left" | "center" | "right" | "top" | "middle" | "bottom" | "horizontal" | "vertical",
  ) => void;
  groupAnnotations: (ids: string[]) => void;
  ungroupAnnotations: (ids: string[]) => void;
  clearPageAnnotations: (pageId: string) => void;
  toggleCover: (id: string) => void;
  setCoversRevealed: (revealed: boolean, pageId?: string | null) => void;
  studyMode: boolean;
  setStudyMode: (value: boolean) => void;
  coverExport: CoverExportMode;
  setCoverExport: (mode: CoverExportMode) => void;
  addImageAsset: (asset: ImageAsset) => void;
  openFiles: (files: File[], opts?: { force?: boolean }) => Promise<void>;
  /** PDFs que superan el tamaño recomendado y esperan decisión del usuario. */
  largePrompt: { files: File[]; oversized: File[] } | null;
  dismissLargePrompt: () => void;
  importFiles: (files: File[], insertAfterPageId?: string | null) => Promise<void>;
  addBlankPage: (insertAfterPageId?: string | null) => Promise<void>;

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
  exportFile: () => Promise<File>;
  extractPages: (ids: string[]) => Promise<void>;
  splitPages: (groups: string[][]) => Promise<void>;
  markSaved: () => void;
  autosaveState: "idle" | "saving" | "saved" | "error";
  recoveryInfo: { fileName: string; updatedAt: number } | null;
  projectRecoveryInfo: { fileName: string; updatedAt: number } | null;
  restoreRecovery: () => Promise<void>;
  restoreProject: () => Promise<void>;
  discardRecovery: () => Promise<void>;
  createProjectVersion: (label: string) => Promise<ProjectVersionInfo>;
  getProjectVersions: () => Promise<ProjectVersionInfo[]>;
  restoreProjectVersion: (file: string) => Promise<void>;
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
  const [largePrompt, setLargePrompt] = useState<{
    files: File[];
    oversized: File[];
  } | null>(null);
  const [tool, setToolState] = useState<ToolId>("select");
  const [style, setStyleState] = useState<AnnotationStyle>(DEFAULT_STYLE);
  const [selectedAnnotationIds, setSelectedAnnotationIds] = useState<string[]>([]);
  const selectedAnnotationId = selectedAnnotationIds[0] ?? null;
  const setSelectedAnnotation = useCallback((id: string | null) => {
    setSelectedAnnotationIds(id ? [id] : []);
  }, []);
  const setSelectedAnnotations = useCallback((ids: string[]) => {
    setSelectedAnnotationIds([...new Set(ids)]);
  }, []);
  const toggleAnnotationSelection = useCallback((id: string, additive = false) => {
    setSelectedAnnotationIds((current) => {
      if (!additive) return [id];
      return current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
    });
  }, []);
  const [studyMode, setStudyMode] = useState(false);
  const [coverExport, setCoverExport] = useState<CoverExportMode>("omit");
  const [autosaveState, setAutosaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [recoveryInfo, setRecoveryInfo] = useState<{
    fileName: string;
    updatedAt: number;
  } | null>(null);
  const [projectRecoveryInfo, setProjectRecoveryInfo] = useState<{
    fileName: string;
    updatedAt: number;
  } | null>(null);
  const [projectRevision, setProjectRevision] = useState(0);
  const autosaveRun = useRef(0);
  const autosaveQueue = useRef<Promise<void>>(Promise.resolve());
  const sourcesRef = useRef<Record<string, PdfSource>>({});

  const doc = history[historyIndex] ?? EMPTY_DOC;
  const pages = doc.pages;
  const annotations = doc.annotations;
  const dirty = historyIndex !== savedIndex;

  useEffect(() => {
    sourcesRef.current = sources;
  }, [sources]);

  useEffect(() => () => destroySources(sourcesRef.current), []);

  const commit = useCallback(
    (updater: (current: DocState) => DocState) => {
      const current = history[historyIndex] ?? EMPTY_DOC;
      const next = [...history.slice(0, historyIndex + 1), updater(current)];
      const overflow = Math.max(0, next.length - MAX_HISTORY);
      setHistory(overflow ? next.slice(overflow) : next);
      setHistoryIndex(next.length - 1 - overflow);
      if (overflow) setSavedIndex((index) => Math.max(-1, index - overflow));
    },
    [history, historyIndex],
  );

  const resetHistory = useCallback((next: DocState) => {
    setHistory([next]);
    setHistoryIndex(0);
    setSavedIndex(0);
  }, []);

  const restoreSnapshot = useCallback(
    async (snapshot: WorkspaceSnapshot) => {
      if (
        dirty &&
        !window.confirm("Hay cambios sin guardar. ¿Quieres sustituir el documento actual?")
      ) {
        return;
      }
      setBusy(true);
      try {
        const restoredSources: Record<string, PdfSource> = {};
        for (const source of snapshot.sources) {
          const file = new File([source.bytes], source.name, { type: "application/pdf" });
          const loaded = await loadSource(file, source.id);
          restoredSources[loaded.id] = loaded;
        }
        destroySources(sources);
        setSources(restoredSources);
        setImages(
          Object.fromEntries(
            snapshot.images.map((image) => [
              image.id,
              {
                id: image.id,
                mime: image.mime,
                width: image.width,
                height: image.height,
                bytes: new Uint8Array(image.bytes),
              },
            ]),
          ),
        );
        resetHistory({ pages: snapshot.pages, annotations: snapshot.annotations });
        setFileName(snapshot.fileName);
        setCoverExport(snapshot.coverExport);
        setSelectionState(snapshot.pages[0] ? [snapshot.pages[0].id] : []);
        setActivePageId(snapshot.pages[0]?.id ?? null);
        setSelectedAnnotation(null);
        setToolState("select");
        toast.success(`Proyecto «${snapshot.fileName}» recuperado`);
      } finally {
        setBusy(false);
      }
    },
    [dirty, resetHistory, setSelectedAnnotation, sources],
  );

  const restoreRecovery = useCallback(async () => {
    const snapshot = await loadRecovery();
    if (!snapshot) throw new Error("recovery-unavailable");
    await restoreSnapshot(snapshot);
  }, [restoreSnapshot]);

  const restoreProject = useCallback(async () => {
    const snapshot = await loadWorkspaceFromActiveProject();
    if (!snapshot) throw new Error("project-recovery-unavailable");
    await restoreSnapshot(snapshot);
  }, [restoreSnapshot]);

  const createProjectVersion = useCallback(
    async (label: string) => {
      if (!pages.length) throw new Error("empty-document");
      const snapshot = createWorkspaceSnapshot({
        fileName,
        pages,
        annotations,
        coverExport,
        sources,
        images,
      });
      const version = await saveProjectVersion(snapshot, label);
      if (!version) throw new Error("project-version-unavailable");
      return version;
    },
    [annotations, coverExport, fileName, images, pages, sources],
  );

  const getProjectVersions = useCallback(() => listProjectVersions(), []);

  const restoreProjectVersion = useCallback(
    async (file: string) => {
      const snapshot = await loadProjectVersion(file);
      if (!snapshot) throw new Error("project-version-unavailable");
      await restoreSnapshot(snapshot);
    },
    [restoreSnapshot],
  );

  const discardRecovery = useCallback(async () => {
    await clearRecovery();
    setRecoveryInfo(null);
  }, []);

  useEffect(() => {
    void getRecoveryInfo()
      .then(setRecoveryInfo)
      .catch(() => undefined);
    const onProjectActive = () => {
      setProjectRevision((value) => value + 1);
      void getActiveProjectWorkspaceInfo()
        .then(setProjectRecoveryInfo)
        .catch(() => {
          setProjectRecoveryInfo(null);
        });
    };
    window.addEventListener("pdf-maestro:project-active", onProjectActive);
    return () => window.removeEventListener("pdf-maestro:project-active", onProjectActive);
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const protect = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [dirty]);

  useEffect(() => {
    if (!pages.length) return;
    const runId = ++autosaveRun.current;
    setAutosaveState("saving");
    const timer = window.setTimeout(() => {
      const snapshot = createWorkspaceSnapshot({
        fileName,
        pages,
        annotations,
        coverExport,
        sources,
        images,
      });
      const save = autosaveQueue.current
        .catch(() => undefined)
        .then(async () => {
          await Promise.all([saveRecovery(snapshot), saveWorkspaceToActiveProject(snapshot)]);
        });
      autosaveQueue.current = save;
      void save
        .then(() => {
          if (autosaveRun.current !== runId) return;
          setAutosaveState("saved");
          setRecoveryInfo({ fileName: snapshot.fileName, updatedAt: snapshot.updatedAt });
        })
        .catch((error) => {
          console.warn("[pdf] no se pudo guardar la recuperación automática", error);
          if (autosaveRun.current === runId) setAutosaveState("error");
        });
    }, 900);
    return () => window.clearTimeout(timer);
  }, [annotations, coverExport, fileName, images, pages, projectRevision, sources]);

  const pagesFromSource = (source: PdfSource): PageEntry[] =>
    Array.from({ length: source.pageCount }, (_, i) => ({
      id: makeId("pg"),
      sourceId: source.id,
      sourceIndex: i + 1,
      rotation: 0,
    }));

  const openFiles = useCallback(
    async (files: File[], opts?: { force?: boolean }) => {
      if (
        !opts?.force &&
        dirty &&
        !window.confirm("Hay cambios sin guardar. ¿Quieres abrir otro documento y sustituirlos?")
      ) {
        return;
      }
      // PDFs muy grandes: el usuario decide (optimizar / original / cancelar).
      if (!opts?.force) {
        const oversized = files.filter((f) => f.size > MAX_BYTES);
        if (oversized.length) {
          setLargePrompt({ files, oversized });
          return;
        }
      }
      setLargePrompt(null);
      setBusy(true);
      try {
        const loaded: PdfSource[] = [];
        for (const file of files) loaded.push(await loadSource(file));
        const nextSources: Record<string, PdfSource> = {};
        for (const s of loaded) nextSources[s.id] = s;
        const nextPages = loaded.flatMap(pagesFromSource);
        destroySources(sources);
        setSources(nextSources);
        resetHistory({ pages: nextPages, annotations: [] });
        setFileName(loaded.length === 1 ? (loaded[0]?.name ?? null) : "documento-combinado.pdf");
        setSelectionState(nextPages[0] ? [nextPages[0].id] : []);
        setActivePageId(nextPages[0]?.id ?? null);
        setSelectedAnnotation(null);
        setToolState("select");
      } finally {
        setBusy(false);
      }
    },
    [dirty, resetHistory, setSelectedAnnotation, sources],
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
          pages: [...current.pages.slice(0, at), ...newPages, ...current.pages.slice(at)],
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

  /** Inserts an empty page, matching the size of the reference page when possible. */
  const addBlankPage = useCallback(
    async (insertAfterPageId?: string | null) => {
      const anchorId = insertAfterPageId ?? activePageId;
      const reference = pages.find((p) => p.id === anchorId) ?? pages[pages.length - 1] ?? null;
      let size = A4;
      if (reference) {
        if (reference.blank) size = reference.blank;
        else {
          const source = sources[reference.sourceId];
          if (source) {
            try {
              size = await getPageSize(source.doc, reference.sourceIndex, 0);
            } catch {
              size = A4;
            }
          }
        }
      }
      const blankPage: PageEntry = {
        id: makeId("pg"),
        sourceId: BLANK_SOURCE_ID,
        sourceIndex: 0,
        rotation: 0,
        blank: { width: size.width, height: size.height },
      };
      const at = anchorId ? pages.findIndex((p) => p.id === anchorId) + 1 : pages.length;
      commit((current) => {
        const index = anchorId
          ? current.pages.findIndex((p) => p.id === anchorId) + 1
          : current.pages.length;
        const insertAt = index > 0 ? index : at;
        return {
          ...current,
          pages: [...current.pages.slice(0, insertAt), blankPage, ...current.pages.slice(insertAt)],
        };
      });
      setActivePageId(blankPage.id);
      setSelectionState([blankPage.id]);
      setSelectedAnnotation(null);
    },
    [activePageId, commit, pages, setSelectedAnnotation, sources],
  );

  const closeDocument = useCallback(() => {
    if (dirty && !window.confirm("Hay cambios sin guardar. ¿Quieres cerrar el documento?")) return;
    destroySources(sources);
    setSources({});
    setImages({});
    resetHistory(EMPTY_DOC);
    setFileName(null);
    setSelectionState([]);
    setActivePageId(null);
    setSelectedAnnotation(null);
    setToolState("select");
    setRecoveryInfo(null);
    autosaveRun.current += 1;
    const clear = autosaveQueue.current.catch(() => undefined).then(clearRecovery);
    autosaveQueue.current = clear;
    void clear;
  }, [dirty, resetHistory, setSelectedAnnotation, sources]);

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
    [activePageId, commit, pages, setSelectedAnnotation],
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
      setSelectedAnnotationIds([annotation.id]);
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

  const updateAnnotations = useCallback(
    (ids: string[], patch: Partial<Annotation>) => {
      if (!ids.length) return;
      const selected = new Set(ids);
      commit((current) => ({
        ...current,
        annotations: current.annotations.map((a) => (selected.has(a.id) ? { ...a, ...patch } : a)),
      }));
    },
    [commit],
  );

  const moveAnnotations = useCallback(
    (ids: string[], dx: number, dy: number) => {
      if (!ids.length || (!dx && !dy)) return;
      const selected = new Set(ids);
      commit((current) => ({
        ...current,
        annotations: current.annotations.map((item) => {
          if (!selected.has(item.id) || item.locked) return item;
          return {
            ...item,
            x: Math.max(0, Math.min(1 - item.width, item.x + dx)),
            y: Math.max(0, Math.min(1 - item.height, item.y + dy)),
          };
        }),
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
      setSelectedAnnotationIds([]);
    },
    [commit],
  );

  const deleteAnnotations = useCallback(
    (ids: string[]) => {
      if (!ids.length) return;
      const selected = new Set(ids);
      commit((current) => ({
        ...current,
        annotations: current.annotations.filter((a) => !selected.has(a.id)),
      }));
      setSelectedAnnotationIds([]);
    },
    [commit],
  );

  const reorderAnnotation = useCallback(
    (id: string, direction: "front" | "forward" | "backward" | "back") => {
      commit((current) => {
        const index = current.annotations.findIndex((item) => item.id === id);
        if (index < 0) return current;
        const item = current.annotations[index]!;
        const pageIndexes = current.annotations
          .map((entry, at) => (entry.pageId === item.pageId ? at : -1))
          .filter((at) => at >= 0);
        const position = pageIndexes.indexOf(index);
        const targetPosition =
          direction === "front"
            ? pageIndexes.length - 1
            : direction === "back"
              ? 0
              : Math.max(
                  0,
                  Math.min(pageIndexes.length - 1, position + (direction === "forward" ? 1 : -1)),
                );
        const targetIndex = pageIndexes[targetPosition];
        if (targetIndex === undefined || targetIndex === index) return current;
        const next = [...current.annotations];
        next.splice(index, 1);
        next.splice(targetIndex, 0, item);
        return { ...current, annotations: next };
      });
    },
    [commit],
  );

  const alignAnnotations = useCallback(
    (
      ids: string[],
      mode: "left" | "center" | "right" | "top" | "middle" | "bottom" | "horizontal" | "vertical",
    ) => {
      if (ids.length < 2) return;
      const selected = new Set(ids);
      commit((current) => {
        const items = current.annotations.filter((item) => selected.has(item.id) && !item.locked);
        if (items.length < 2) return current;
        const minX = Math.min(...items.map((item) => item.x));
        const maxX = Math.max(...items.map((item) => item.x + item.width));
        const minY = Math.min(...items.map((item) => item.y));
        const maxY = Math.max(...items.map((item) => item.y + item.height));
        const ordered =
          mode === "horizontal"
            ? [...items].sort((a, b) => a.x - b.x)
            : [...items].sort((a, b) => a.y - b.y);
        const distributed = new Map<string, Partial<Annotation>>();
        if (mode === "horizontal" && ordered.length > 2) {
          const total = ordered.reduce((sum, item) => sum + item.width, 0);
          const gap = (maxX - minX - total) / (ordered.length - 1);
          let cursor = minX;
          for (const item of ordered) {
            distributed.set(item.id, { x: cursor });
            cursor += item.width + gap;
          }
        } else if (mode === "vertical" && ordered.length > 2) {
          const total = ordered.reduce((sum, item) => sum + item.height, 0);
          const gap = (maxY - minY - total) / (ordered.length - 1);
          let cursor = minY;
          for (const item of ordered) {
            distributed.set(item.id, { y: cursor });
            cursor += item.height + gap;
          }
        }
        return {
          ...current,
          annotations: current.annotations.map((item) => {
            if (!selected.has(item.id) || item.locked) return item;
            if (mode === "left") return { ...item, x: minX };
            if (mode === "center") return { ...item, x: (minX + maxX - item.width) / 2 };
            if (mode === "right") return { ...item, x: maxX - item.width };
            if (mode === "top") return { ...item, y: minY };
            if (mode === "middle") return { ...item, y: (minY + maxY - item.height) / 2 };
            if (mode === "bottom") return { ...item, y: maxY - item.height };
            return { ...item, ...(distributed.get(item.id) ?? {}) };
          }),
        };
      });
    },
    [commit],
  );

  const groupAnnotations = useCallback(
    (ids: string[]) => {
      if (ids.length < 2) return;
      const groupId = makeId("group");
      updateAnnotations(ids, { groupId });
    },
    [updateAnnotations],
  );

  const ungroupAnnotations = useCallback(
    (ids: string[]) => {
      updateAnnotations(ids, { groupId: undefined });
    },
    [updateAnnotations],
  );

  const duplicateAnnotation = useCallback(
    (id: string) => {
      const source = annotations.find((annotation) => annotation.id === id);
      if (!source) return;
      const copy: Annotation = {
        ...source,
        id: makeId("ann"),
        groupId: undefined,
        x: Math.min(1 - source.width, source.x + 0.02),
        y: Math.min(1 - source.height, source.y + 0.02),
        ...(source.points ? { points: source.points.map((point) => ({ ...point })) } : {}),
      };
      addAnnotation(copy);
    },
    [addAnnotation, annotations],
  );

  const clearPageAnnotations = useCallback(
    (pageId: string) => {
      commit((current) => ({
        ...current,
        annotations: current.annotations.filter((a) => a.pageId !== pageId),
      }));
      setSelectedAnnotation(null);
    },
    [commit, setSelectedAnnotation],
  );

  /** Reveals/hides one study strip. Undoable like any other change. */
  const toggleCover = useCallback(
    (id: string) => {
      commit((current) => ({
        ...current,
        annotations: current.annotations.map((a) =>
          a.id === id && a.kind === "studyCover" ? { ...a, revealed: !a.revealed } : a,
        ),
      }));
    },
    [commit],
  );

  const setCoversRevealed = useCallback(
    (revealed: boolean, pageId?: string | null) => {
      commit((current) => ({
        ...current,
        annotations: current.annotations.map((a) =>
          a.kind === "studyCover" && (!pageId || a.pageId === pageId) ? { ...a, revealed } : a,
        ),
      }));
    },
    [commit],
  );

  const addImageAsset = useCallback((asset: ImageAsset) => {
    setImages((prev) => ({ ...prev, [asset.id]: asset }));
  }, []);

  const undo = useCallback(() => {
    setSelectedAnnotation(null);
    setHistoryIndex((i) => Math.max(0, i - 1));
  }, [setSelectedAnnotation]);
  const redo = useCallback(() => {
    setSelectedAnnotation(null);
    setHistoryIndex((i) => Math.min(history.length - 1, i + 1));
  }, [history.length, setSelectedAnnotation]);

  const download = useCallback(async () => {
    setBusy(true);
    try {
      const draft = await buildPdf(pages, sources, {
        annotations,
        images,
        coverMode: coverExport,
      });
      const bytes = annotations.some((item) => item.kind === "redact")
        ? await flattenForSecureRedaction(draft)
        : draft;
      await downloadBytes(bytes, editedFileName(fileName));
      const fallbacks = getFontFallbacks();
      if (fallbacks.length)
        toast.warning(
          `No se pudo incrustar la tipografía: ${fallbacks.join(", ")}. Se ha usado Helvetica.`,
        );
      setSavedIndex(historyIndex);
    } finally {
      setBusy(false);
    }
  }, [annotations, coverExport, fileName, historyIndex, images, pages, sources]);

  const exportFile = useCallback(async () => {
    setBusy(true);
    try {
      const draft = await buildPdf(pages, sources, {
        annotations,
        images,
        coverMode: coverExport,
      });
      const bytes = annotations.some((item) => item.kind === "redact")
        ? await flattenForSecureRedaction(draft)
        : draft;
      const name = editedFileName(fileName);
      return new File([bytes.slice(0) as unknown as BlobPart], name, {
        type: "application/pdf",
      });
    } finally {
      setBusy(false);
    }
  }, [annotations, coverExport, fileName, images, pages, sources]);

  const extractPages = useCallback(
    async (ids: string[]) => {
      setBusy(true);
      try {
        const subset = pages.filter((p) => ids.includes(p.id));
        const draft = await buildPdf(subset, sources, {
          annotations,
          images,
          coverMode: coverExport,
        });
        const bytes = annotations.some(
          (item) => item.kind === "redact" && ids.includes(item.pageId),
        )
          ? await flattenForSecureRedaction(draft)
          : draft;
        const base = (fileName ?? "documento").replace(/\.pdf$/i, "");
        await downloadBytes(bytes, `${base}-extraido.pdf`);
      } finally {
        setBusy(false);
      }
    },
    [annotations, coverExport, fileName, images, pages, sources],
  );

  const splitPages = useCallback(
    async (groups: string[][]) => {
      const validGroups = groups.filter((group) => group.length > 0);
      if (validGroups.length === 0) return;
      setBusy(true);
      try {
        const base = (fileName ?? "documento").replace(/\.pdf$/i, "");
        if (validGroups.length === 1) {
          const subset = pages.filter((page) => validGroups[0]!.includes(page.id));
          const draft = await buildPdf(subset, sources, {
            annotations,
            images,
            coverMode: coverExport,
          });
          const bytes = annotations.some(
            (item) => item.kind === "redact" && validGroups[0]!.includes(item.pageId),
          )
            ? await flattenForSecureRedaction(draft)
            : draft;
          await downloadBytes(bytes, `${base}-parte-1.pdf`);
          return;
        }
        const { default: JSZip } = await import("jszip");
        const zip = new JSZip();
        for (let index = 0; index < validGroups.length; index += 1) {
          const ids = validGroups[index]!;
          const subset = pages.filter((page) => ids.includes(page.id));
          const draft = await buildPdf(subset, sources, {
            annotations,
            images,
            coverMode: coverExport,
          });
          const bytes = annotations.some(
            (item) => item.kind === "redact" && ids.includes(item.pageId),
          )
            ? await flattenForSecureRedaction(draft)
            : draft;
          zip.file(`${base}-parte-${index + 1}.pdf`, bytes);
        }
        const archive = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
        await downloadBytes(archive, `${base}-dividido.zip`);
      } finally {
        setBusy(false);
      }
    },
    [annotations, coverExport, fileName, images, pages, sources],
  );

  const toggleSelection = useCallback((id: string, additive: boolean) => {
    setSelectionState((prev) => {
      if (!additive) return [id];
      return prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id];
    });
    setActivePageId(id);
  }, []);

  const setTool = useCallback(
    (next: ToolId) => {
      setToolState(next);
      if (next !== "select") setSelectedAnnotation(null);
    },
    [setSelectedAnnotation],
  );

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
      dirty,
      busy,
      selection,
      activePageId,
      canUndo: historyIndex > 0,
      canRedo: historyIndex < history.length - 1,
      hasDocument: pages.length > 0,
      tool,
      style,
      selectedAnnotationId,
      selectedAnnotationIds,
      setTool,
      setStyle,
      setSelectedAnnotation,
      setSelectedAnnotations,
      toggleAnnotationSelection,
      addAnnotation,
      updateAnnotation,
      updateAnnotations,
      moveAnnotations,
      deleteAnnotation,
      deleteAnnotations,
      duplicateAnnotation,
      reorderAnnotation,
      alignAnnotations,
      groupAnnotations,
      ungroupAnnotations,
      clearPageAnnotations,
      toggleCover,
      setCoversRevealed,
      studyMode,
      setStudyMode,
      coverExport,
      setCoverExport,
      addImageAsset,
      openFiles,
      largePrompt,
      dismissLargePrompt: () => setLargePrompt(null),
      importFiles,
      addBlankPage,

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
      exportFile,
      extractPages,
      splitPages,
      markSaved: () => setSavedIndex(historyIndex),
      autosaveState,
      recoveryInfo,
      projectRecoveryInfo,
      restoreRecovery,
      restoreProject,
      discardRecovery,
      createProjectVersion,
      getProjectVersions,
      restoreProjectVersion,
    }),
    [
      activePageId,
      addAnnotation,
      addImageAsset,
      annotations,
      busy,
      clearPageAnnotations,
      toggleCover,
      setCoversRevealed,
      studyMode,
      coverExport,
      closeDocument,

      deleteAnnotation,
      deleteAnnotations,
      duplicateAnnotation,
      reorderAnnotation,
      alignAnnotations,
      groupAnnotations,
      ungroupAnnotations,
      deletePages,
      dirty,
      download,
      exportFile,
      duplicatePages,
      extractPages,
      splitPages,
      fileName,
      history.length,
      historyIndex,
      images,
      importFiles,
      addBlankPage,

      movePage,
      openFiles,
      largePrompt,
      pages,
      redo,
      recoveryInfo,
      projectRecoveryInfo,
      restoreRecovery,
      restoreProject,
      discardRecovery,
      createProjectVersion,
      getProjectVersions,
      restoreProjectVersion,
      rotatePages,
      selectedAnnotationId,
      selectedAnnotationIds,
      selection,
      setSelectedAnnotation,
      setSelectedAnnotations,
      setStyle,
      setTool,
      sources,
      style,
      toggleSelection,
      toggleAnnotationSelection,
      tool,
      undo,
      updateAnnotation,
      updateAnnotations,
      moveAnnotations,
      autosaveState,
    ],
  );

  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}

export function usePdfEditor(): EditorContextValue {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error("usePdfEditor must be used inside PdfEditorProvider");
  return ctx;
}
