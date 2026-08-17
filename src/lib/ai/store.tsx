// Estado global del módulo de IA: cuadernos, fuentes, chat, motor y progreso.
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
import {
  clearChat,
  deleteNotebook as dbDeleteNotebook,
  deleteSource as dbDeleteSource,
  listChat,
  listNotebooks,
  listSources,
  putChatTurn,
  putNotebook,
  putSource,
  getSetting,
  setSetting,
} from "./db";
import { ensureNeuralEmbedder, getEmbedder, onEmbedderChange } from "./embeddings";
import { askWithSources, ingestFile, STEP_LABEL, type IngestProgress } from "./pipeline";
import {
  createWebLlmProvider,
  extractiveProvider,
  hasWebGpu,
  isWebLlmLoaded,
  loadWebLlm,
} from "./llm";
import { indexedDbVectorStore, invalidateNotebook } from "./vectorStore";
import type {
  AnswerMode,
  ChatTurn,
  Citation,
  LlmMessage,
  LlmProvider,
  Notebook,
  RetrievalScope,
  Source,
} from "./types";

function makeId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

export interface JobState {
  sourceId: string;
  name: string;
  label: string;
  ratio: number;
}

interface AiContextValue {
  ready: boolean;
  notebooks: Notebook[];
  activeNotebook: Notebook | null;
  sources: Source[];
  chat: ChatTurn[];
  jobs: JobState[];
  mode: AnswerMode;
  streaming: string | null;
  thinking: boolean;
  embedderLabel: string;
  webGpu: boolean;
  modelId: string | null;
  llmLabel: string;
  setMode: (mode: AnswerMode) => void;
  selectNotebook: (id: string) => void;
  createNotebook: (name: string, description?: string) => Promise<Notebook>;
  renameNotebook: (id: string, name: string, description?: string) => Promise<void>;
  removeNotebook: (id: string) => Promise<void>;
  addFiles: (files: File[], notebookId?: string) => Promise<void>;
  removeSource: (id: string) => Promise<void>;
  toggleSource: (id: string, enabled: boolean) => Promise<void>;
  ask: (question: string, options?: { scope?: RetrievalScope; mode?: AnswerMode }) => Promise<void>;
  resetChat: () => Promise<void>;
  runTool: (prompt: string, options?: { scope?: RetrievalScope; topK?: number }) => Promise<{
    answer: string;
    citations: Citation[];
  }>;
  activateLocalModel: (
    modelId: string,
    onProgress: (info: { text: string; progress: number }) => void,
  ) => Promise<void>;
  useExtractive: () => void;
  enableNeuralEmbeddings: () => Promise<void>;
}

const AiContext = createContext<AiContextValue | null>(null);

export function AiProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [chat, setChat] = useState<ChatTurn[]>([]);
  const [jobs, setJobs] = useState<JobState[]>([]);
  const [mode, setMode] = useState<AnswerMode>("sources-only");
  const [streaming, setStreaming] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);
  const [embedderLabel, setEmbedderLabel] = useState(getEmbedder().label);
  const [modelId, setModelId] = useState<string | null>(null);
  const providerRef = useRef<LlmProvider>(extractiveProvider);
  const [llmLabel, setLlmLabel] = useState(extractiveProvider.label);

  useEffect(() => onEmbedderChange((provider) => setEmbedderLabel(provider.label)), []);

  // Carga inicial desde IndexedDB.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const stored = await listNotebooks();
        const lastId = await getSetting<string>("activeNotebook");
        if (!alive) return;
        setNotebooks(stored);
        const initial = stored.find((notebook) => notebook.id === lastId) ?? stored[0] ?? null;
        setActiveId(initial?.id ?? null);
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Fuentes y chat del cuaderno activo.
  useEffect(() => {
    if (!activeId) {
      setSources([]);
      setChat([]);
      return;
    }
    let alive = true;
    (async () => {
      const [nextSources, nextChat] = await Promise.all([
        listSources(activeId),
        listChat(activeId),
      ]);
      if (!alive) return;
      setSources(nextSources);
      setChat(nextChat);
    })();
    void setSetting("activeNotebook", activeId);
    return () => {
      alive = false;
    };
  }, [activeId]);

  const activeNotebook = useMemo(
    () => notebooks.find((notebook) => notebook.id === activeId) ?? null,
    [notebooks, activeId],
  );

  const touchNotebook = useCallback(async (id: string) => {
    setNotebooks((prev) => {
      const next = prev.map((notebook) =>
        notebook.id === id ? { ...notebook, updatedAt: Date.now() } : notebook,
      );
      const target = next.find((notebook) => notebook.id === id);
      if (target) void putNotebook(target);
      return next;
    });
  }, []);

  const createNotebook = useCallback(async (name: string, description?: string) => {
    const notebook: Notebook = {
      id: makeId("nb"),
      name: name.trim() || "Cuaderno sin título",
      ...(description?.trim() ? { description: description.trim() } : {}),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await putNotebook(notebook);
    setNotebooks((prev) => [notebook, ...prev]);
    setActiveId(notebook.id);
    return notebook;
  }, []);

  const renameNotebook = useCallback(
    async (id: string, name: string, description?: string) => {
      const current = notebooks.find((notebook) => notebook.id === id);
      if (!current) return;
      const next: Notebook = {
        ...current,
        name: name.trim() || current.name,
        ...(description !== undefined ? { description: description.trim() } : {}),
        updatedAt: Date.now(),
      };
      await putNotebook(next);
      setNotebooks((prev) => prev.map((notebook) => (notebook.id === id ? next : notebook)));
    },
    [notebooks],
  );

  const removeNotebook = useCallback(
    async (id: string) => {
      await dbDeleteNotebook(id);
      invalidateNotebook(id);
      setNotebooks((prev) => prev.filter((notebook) => notebook.id !== id));
      setActiveId((prev) => (prev === id ? null : prev));
    },
    [],
  );

  const upsertSource = useCallback((source: Source) => {
    setSources((prev) => {
      const index = prev.findIndex((item) => item.id === source.id);
      if (index === -1) return [...prev, source];
      const next = [...prev];
      next[index] = source;
      return next;
    });
  }, []);

  const addFiles = useCallback(
    async (files: File[], notebookId?: string) => {
      const target = notebookId ?? activeId;
      if (!target) throw new Error("no-notebook");
      for (const file of files) {
        const jobId = makeId("job");
        setJobs((prev) => [
          ...prev,
          { sourceId: jobId, name: file.name, label: STEP_LABEL.reading, ratio: 0.02 },
        ]);
        const onProgress = (progress: IngestProgress) =>
          setJobs((prev) =>
            prev.map((job) =>
              job.sourceId === jobId
                ? { ...job, label: STEP_LABEL[progress.step], ratio: progress.ratio }
                : job,
            ),
          );
        try {
          await ingestFile(target, file, onProgress, upsertSource);
        } catch {
          // El estado de error ya queda registrado en la fuente.
        } finally {
          setJobs((prev) => prev.filter((job) => job.sourceId !== jobId));
        }
      }
      await touchNotebook(target);
    },
    [activeId, touchNotebook, upsertSource],
  );

  const removeSource = useCallback(async (id: string) => {
    await dbDeleteSource(id);
    await indexedDbVectorStore.removeBySource(id);
    setSources((prev) => prev.filter((source) => source.id !== id));
  }, []);

  const toggleSource = useCallback(
    async (id: string, enabled: boolean) => {
      const source = sources.find((item) => item.id === id);
      if (!source) return;
      const next = { ...source, enabled };
      await putSource(next);
      upsertSource(next);
    },
    [sources, upsertSource],
  );

  const enabledSourceIds = useMemo(
    () => sources.filter((source) => source.enabled && source.status === "ready").map((s) => s.id),
    [sources],
  );

  const history = useCallback((): LlmMessage[] => {
    return chat.slice(-6).map((turn) => ({
      role: turn.role === "user" ? "user" : "assistant",
      content: turn.content,
    }));
  }, [chat]);

  const ask = useCallback(
    async (
      question: string,
      options?: { scope?: RetrievalScope; mode?: AnswerMode },
    ): Promise<void> => {
      if (!activeId || !question.trim()) return;
      const userTurn: ChatTurn = {
        id: makeId("turn"),
        notebookId: activeId,
        role: "user",
        content: question.trim(),
        citations: [],
        createdAt: Date.now(),
      };
      setChat((prev) => [...prev, userTurn]);
      await putChatTurn(userTurn);
      setThinking(true);
      setStreaming("");
      try {
        const result = await askWithSources({
          provider: providerRef.current,
          notebookId: activeId,
          question: question.trim(),
          mode: options?.mode ?? mode,
          history: history(),
          sourceIds: enabledSourceIds,
          ...(options?.scope ? { scope: options.scope } : {}),
          onToken: (delta) => setStreaming((prev) => (prev ?? "") + delta),
        });
        const assistantTurn: ChatTurn = {
          id: makeId("turn"),
          notebookId: activeId,
          role: "assistant",
          content: result.answer,
          citations: result.citations,
          createdAt: Date.now(),
          mode: options?.mode ?? mode,
        };
        setChat((prev) => [...prev, assistantTurn]);
        await putChatTurn(assistantTurn);
      } finally {
        setThinking(false);
        setStreaming(null);
      }
    },
    [activeId, enabledSourceIds, history, mode],
  );

  const runTool = useCallback(
    async (prompt: string, options?: { scope?: RetrievalScope; topK?: number }) => {
      if (!activeId) throw new Error("no-notebook");
      const result = await askWithSources({
        provider: providerRef.current,
        notebookId: activeId,
        question: prompt,
        mode: "sources-only",
        sourceIds: enabledSourceIds,
        topK: options?.topK ?? 8,
        ...(options?.scope ? { scope: options.scope } : {}),
      });
      return { answer: result.answer, citations: result.citations };
    },
    [activeId, enabledSourceIds],
  );

  const resetChat = useCallback(async () => {
    if (!activeId) return;
    await clearChat(activeId);
    setChat([]);
  }, [activeId]);

  const activateLocalModel = useCallback(
    async (id: string, onProgress: (info: { text: string; progress: number }) => void) => {
      if (!isWebLlmLoaded(id)) await loadWebLlm(id, onProgress);
      const provider = createWebLlmProvider(id);
      providerRef.current = provider;
      setModelId(id);
      setLlmLabel(provider.label);
    },
    [],
  );

  const useExtractive = useCallback(() => {
    providerRef.current = extractiveProvider;
    setModelId(null);
    setLlmLabel(extractiveProvider.label);
  }, []);

  const enableNeuralEmbeddings = useCallback(async () => {
    await ensureNeuralEmbedder(true);
  }, []);

  const value = useMemo<AiContextValue>(
    () => ({
      ready,
      notebooks,
      activeNotebook,
      sources,
      chat,
      jobs,
      mode,
      streaming,
      thinking,
      embedderLabel,
      webGpu: hasWebGpu(),
      modelId,
      llmLabel,
      setMode,
      selectNotebook: setActiveId,
      createNotebook,
      renameNotebook,
      removeNotebook,
      addFiles,
      removeSource,
      toggleSource,
      ask,
      resetChat,
      runTool,
      activateLocalModel,
      useExtractive,
      enableNeuralEmbeddings,
    }),
    [
      ready,
      notebooks,
      activeNotebook,
      sources,
      chat,
      jobs,
      mode,
      streaming,
      thinking,
      embedderLabel,
      modelId,
      llmLabel,
      createNotebook,
      renameNotebook,
      removeNotebook,
      addFiles,
      removeSource,
      toggleSource,
      ask,
      resetChat,
      runTool,
      activateLocalModel,
      useExtractive,
      enableNeuralEmbeddings,
    ],
  );

  return <AiContext.Provider value={value}>{children}</AiContext.Provider>;
}

export function useAi(): AiContextValue {
  const context = useContext(AiContext);
  if (!context) throw new Error("useAi debe usarse dentro de AiProvider");
  return context;
}
