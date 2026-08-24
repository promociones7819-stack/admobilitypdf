import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FileArchive,
  FileCode2,
  FileJson,
  Home,
  List,
  MousePointer2,
  PencilRuler,
  Plus,
  Circle,
  Square,
  Trash2,
  Redo2,
  Undo2,
  Upload,
  Wand2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { buildFlipbookZip, buildSingleFlipbookHtml, publicationName } from "@/lib/flipbook/publish";
import {
  disposeFlipbookDocument,
  loadFlipbookDocument,
  type FlipbookDocument,
} from "@/lib/flipbook/document";
import {
  documentKey,
  loadConfig,
  makeHotspotId,
  normalizeConfig,
  safeExternalUrl,
  safeMediaSource,
  saveConfig,
  actionLabel,
  EMPTY_CONFIG,
  type FlipbookConfig,
  type Hotspot,
  type HotspotAction,
  type HotspotButtonPreset,
} from "@/lib/flipbook/hotspots";
import { saveBlob } from "@/lib/download";
import { saveToActiveProject } from "@/lib/projects/storage";
import { FlipbookStage, type FlipbookHandle } from "./FlipbookStage";
import { AutoMenuDialog } from "./AutoMenuDialog";
import { HotspotEditor } from "./HotspotEditor";
import { OutlineEditorDialog } from "./OutlineEditorDialog";

type Mode = "view" | "edit";
type DraftKind = "page" | "url" | "menu" | "popup" | "media";

interface Geometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function FlipbookWorkspace({
  initialFile,
  embedded = false,
}: {
  initialFile?: File | null;
  embedded?: boolean;
}) {
  const [doc, setDoc] = useState<FlipbookDocument | null>(null);
  const [docName, setDocName] = useState<string>("");
  const [storageKey, setStorageKey] = useState<string | null>(null);
  const [loading, setLoading] = useState<{ done: number; total: number } | null>(null);
  const [config, setConfig] = useState<FlipbookConfig>(EMPTY_CONFIG);
  const configRef = useRef<FlipbookConfig>(EMPTY_CONFIG);
  const pastRef = useRef<FlipbookConfig[]>([]);
  const futureRef = useRef<FlipbookConfig[]>([]);
  const [mode, setMode] = useState<Mode>("view");
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [adding, setAdding] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [autoMenu, setAutoMenu] = useState(false);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [srcFile, setSrcFile] = useState<File | null>(null);
  const [publishing, setPublishing] = useState(false);

  const [dialog, setDialog] = useState<{
    id: string;
    kind: DraftKind;
    targetPage: string;
    url: string;
    title: string;
    text: string;
    mediaType: "video" | "audio" | "image";
  } | null>(null);
  const openRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const mediaRef = useRef<HTMLInputElement>(null);
  const flipRef = useRef<FlipbookHandle>(null);
  const initialFileRef = useRef<File | null>(null);
  const documentRef = useRef<FlipbookDocument | null>(null);

  const pages = doc?.pages ?? [];
  const pageCount = pages.length;
  const currentPage = pages[Math.min(page, pageCount) - 1] ?? null;
  const selected = config.hotspots.find((h) => h.id === selectedId) ?? null;
  const pageHotspots = useMemo(
    () => config.hotspots.filter((h) => h.page === page),
    [config.hotspots, page],
  );
  const effectiveOutline = config.outline ?? doc?.outline ?? [];

  const setConfigWithHistory = (
    update: FlipbookConfig | ((current: FlipbookConfig) => FlipbookConfig),
    record = true,
  ) => {
    const current = configRef.current;
    const next = typeof update === "function" ? update(current) : update;
    if (record) {
      pastRef.current = [...pastRef.current.slice(-79), current];
      futureRef.current = [];
    }
    configRef.current = next;
    setConfig(next);
  };

  const resetConfig = (next: FlipbookConfig) => {
    pastRef.current = [];
    futureRef.current = [];
    configRef.current = next;
    setConfig(next);
  };

  const checkpointConfig = () => {
    pastRef.current = [...pastRef.current.slice(-79), configRef.current];
    futureRef.current = [];
  };

  const undoConfig = () => {
    const previous = pastRef.current.at(-1);
    if (!previous) return;
    pastRef.current = pastRef.current.slice(0, -1);
    futureRef.current = [configRef.current, ...futureRef.current.slice(0, 79)];
    configRef.current = previous;
    setConfig(previous);
    setSelectedId(null);
  };

  const redoConfig = () => {
    const next = futureRef.current[0];
    if (!next) return;
    futureRef.current = futureRef.current.slice(1);
    pastRef.current = [...pastRef.current.slice(-79), configRef.current];
    configRef.current = next;
    setConfig(next);
    setSelectedId(null);
  };

  // Persistencia automática por documento: navegador y, si existe, carpeta del proyecto.
  useEffect(() => {
    if (!storageKey) return;
    saveConfig(storageKey, config);
    const timer = window.setTimeout(() => {
      const name = `${(docName || "flipbook").replace(/\.pdf$/i, "")}.hotspots.json`;
      void saveToActiveProject(
        new Blob([JSON.stringify(config, null, 2)], { type: "application/json" }),
        name,
      );
    }, 700);
    return () => window.clearTimeout(timer);
  }, [config, docName, storageKey]);

  useEffect(
    () => () => {
      disposeFlipbookDocument(documentRef.current);
    },
    [],
  );

  const openFile = useCallback(async (file: File) => {
    if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) {
      toast.error("Solo se admiten archivos PDF.");
      return;
    }
    setLoading({ done: 0, total: 0 });
    try {
      const loaded = await loadFlipbookDocument(file, (done, total) => setLoading({ done, total }));
      const key = documentKey(file);
      disposeFlipbookDocument(documentRef.current);
      documentRef.current = loaded;
      setDoc(loaded);
      setSrcFile(file);
      setDocName(file.name);
      setStorageKey(key);
      resetConfig(loadConfig(key));
      setPage(1);
      setMode("view");
      setSelectedId(null);
      toast.success(`Flipbook listo (${loaded.pages.length} páginas)`);
    } catch (error) {
      console.error("[flipbook] error al abrir", error);
      toast.error("No se ha podido abrir el PDF.");
    } finally {
      setLoading(null);
    }
  }, []);

  useEffect(() => {
    if (!initialFile || initialFileRef.current === initialFile) return;
    initialFileRef.current = initialFile;
    void openFile(initialFile);
  }, [initialFile, openFile]);

  const goToPage = useCallback(
    (target: number) => {
      const next = Math.min(Math.max(target, 1), pageCount || 1);
      setPage(next);
      if (mode === "view") flipRef.current?.flipTo(next);
    },
    [mode, pageCount],
  );

  const updateHotspot = (id: string, patch: Partial<Hotspot>, record = true) =>
    setConfigWithHistory(
      (prev) => ({
        ...prev,
        hotspots: prev.hotspots.map((h) => (h.id === id ? { ...h, ...patch } : h)),
      }),
      record,
    );

  const createHotspot = (geometry: Geometry) => {
    const hotspot: Hotspot = {
      id: makeHotspotId(),
      page,
      ...geometry,
      action: { type: "page", targetPage: config.menuPage },
    };
    setConfigWithHistory((prev) => ({ ...prev, hotspots: [...prev.hotspots, hotspot] }));
    setSelectedId(hotspot.id);
    setAdding(false);
    setDialog({
      id: hotspot.id,
      kind: "page",
      targetPage: String(config.menuPage),
      url: "",
      title: "",
      text: "",
      mediaType: "video",
    });
  };

  const createPresetButton = (buttonPreset: HotspotButtonPreset) => {
    if (!currentPage) return;
    const arrow = buttonPreset.startsWith("arrow-");
    const branded = buttonPreset === "ad-mobility";
    const width = Math.min(branded ? 132 : arrow ? 82 : 58, currentPage.width * 0.24);
    const height = Math.min(branded ? 112 : arrow ? 52 : 58, currentPage.height * 0.18);
    const hotspot: Hotspot = {
      id: makeHotspotId(),
      page,
      x: (currentPage.width - width) / 2,
      y: (currentPage.height - height) / 2,
      width,
      height,
      buttonPreset,
      label: branded ? "AD Mobility" : "Botón interactivo",
      action: { type: "page", targetPage: config.menuPage },
    };
    setConfigWithHistory((prev) => ({ ...prev, hotspots: [...prev.hotspots, hotspot] }));
    setSelectedId(hotspot.id);
    setAdding(false);
    setDialog({
      id: hotspot.id,
      kind: "page",
      targetPage: String(config.menuPage),
      url: "",
      title: "",
      text: "",
      mediaType: "video",
    });
  };

  const openDialogFor = (hotspot: Hotspot) =>
    setDialog({
      id: hotspot.id,
      kind: hotspot.action.type,
      targetPage:
        hotspot.action.type === "page"
          ? String(hotspot.action.targetPage)
          : String(config.menuPage),
      url: hotspot.action.type === "url" ? hotspot.action.url : "",
      title:
        hotspot.action.type === "popup" || hotspot.action.type === "media"
          ? (hotspot.action.title ?? "")
          : "",
      text: hotspot.action.type === "popup" ? hotspot.action.text : "",
      mediaType: hotspot.action.type === "media" ? hotspot.action.mediaType : "video",
    });

  const saveDialog = () => {
    if (!dialog) return;
    let action: HotspotAction;
    if (dialog.kind === "url") {
      const url = safeExternalUrl(dialog.url);
      if (!url) {
        toast.error("Introduce una URL válida (http, https, mailto o tel).");
        return;
      }
      action = { type: "url", url };
    } else if (dialog.kind === "popup") {
      if (!dialog.text.trim()) {
        toast.error("Escribe el contenido de la ventana.");
        return;
      }
      action = {
        type: "popup",
        title: dialog.title.trim() || "Información",
        text: dialog.text.trim(),
      };
    } else if (dialog.kind === "media") {
      const source = safeMediaSource(dialog.url, dialog.mediaType);
      if (!source) {
        toast.error("Selecciona un archivo o introduce una dirección http/https válida.");
        return;
      }
      action = {
        type: "media",
        mediaType: dialog.mediaType,
        src: source,
        ...(dialog.title.trim() ? { title: dialog.title.trim() } : {}),
      };
    } else if (dialog.kind === "menu") {
      action = { type: "menu" };
    } else {
      const target = Number(dialog.targetPage);
      if (!target || target < 1 || target > pageCount) {
        toast.error(`Introduce una página entre 1 y ${pageCount}.`);
        return;
      }
      action = { type: "page", targetPage: target };
    }
    updateHotspot(dialog.id, { action });
    setDialog(null);
    toast.success("Hotspot guardado");
  };

  const duplicateHotspot = (hotspot: Hotspot) => {
    const copy: Hotspot = {
      ...hotspot,
      id: makeHotspotId(),
      x: Math.min(hotspot.x + 12, Math.max(0, (currentPage?.width ?? 0) - hotspot.width)),
      y: Math.min(hotspot.y + 12, Math.max(0, (currentPage?.height ?? 0) - hotspot.height)),
    };
    setConfigWithHistory((prev) => ({ ...prev, hotspots: [...prev.hotspots, copy] }));
    setSelectedId(copy.id);
  };

  const removeHotspot = (id: string) => {
    setConfigWithHistory((prev) => ({
      ...prev,
      hotspots: prev.hotspots.filter((h) => h.id !== id),
    }));
    setSelectedId(null);
  };

  const exportConfig = async () => {
    const json = JSON.stringify(config, null, 2);
    await saveBlob(
      new Blob([json], { type: "application/json" }),
      `${docName || "flipbook"}.hotspots.json`,
    );
    toast.success("Configuración exportada");
  };

  /** Exporta la publicación completa: PDF + visor + librerías + hotspots + índice. */
  const exportPublication = async () => {
    if (!srcFile || !doc) {
      toast.error("Abre de nuevo el PDF para poder exportar el flipbook.");
      return;
    }
    setPublishing(true);
    try {
      const zip = await buildFlipbookZip({
        file: srcFile,
        docName,
        config,
        outline: doc.outline,
      });
      await saveBlob(zip, `${publicationName(docName)}-flipbook.zip`);
      toast.success("Flipbook autocontenido exportado (.zip)");
    } catch (error) {
      console.error("[flipbook] exportación fallida", error);
      toast.error("No se ha podido generar el ZIP del flipbook.");
    } finally {
      setPublishing(false);
    }
  };

  /** Exporta un único HTML que se abre directamente con doble clic. */
  const exportSingleHtml = async () => {
    if (!doc) {
      toast.error("Abre un PDF para poder exportar el flipbook.");
      return;
    }
    setPublishing(true);
    try {
      const html = await buildSingleFlipbookHtml({
        docName,
        pages: doc.pages,
        config,
        outline: doc.outline,
      });
      const output = new Blob([html], { type: "text/html;charset=utf-8" });
      await saveBlob(output, `${publicationName(docName)}-flipbook.html`);
      if (output.size > 80 * 1024 * 1024) {
        toast.warning(
          "El HTML supera 80 MB. Para compartirlo suele ser mejor exportar el ZIP completo.",
        );
      }
      toast.success("Flipbook HTML listo: ábrelo con doble clic");
    } catch (error) {
      console.error("[flipbook] exportación HTML fallida", error);
      toast.error("No se ha podido generar el HTML del flipbook.");
    } finally {
      setPublishing(false);
    }
  };

  const importConfig = async (file: File) => {
    try {
      const parsed = normalizeConfig(JSON.parse(await file.text()));
      resetConfig(parsed);
      setSelectedId(null);
      toast.success(`Importados ${parsed.hotspots.length} hotspots`);
    } catch (error) {
      console.error("[flipbook] importación fallida", error);
      toast.error("El archivo JSON no es válido.");
    }
  };

  if (!doc) {
    return (
      <div className="flex min-h-[70svh] flex-col items-center justify-center gap-4 px-6 text-center">
        <span className="inline-flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <BookOpen className="size-7" />
        </span>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            Flipbook con enlaces interactivos
          </h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Abre un PDF para verlo como libro y añadir hotspots que salten a otras páginas, a una
            URL o al menú del documento. Todo el proceso ocurre en tu navegador.
          </p>
        </div>
        <Button onClick={() => openRef.current?.click()} disabled={!!loading}>
          {loading ? `Preparando páginas ${loading.done}/${loading.total || "…"}` : "Abrir PDF"}
        </Button>
        <input
          ref={openRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void openFile(file);
          }}
        />
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${embedded ? "h-full" : "h-[calc(100svh-3.5rem)]"}`}>
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-2">
        <div className="flex overflow-hidden rounded-md border border-border">
          <Button
            variant={mode === "view" ? "secondary" : "ghost"}
            size="sm"
            className="rounded-none"
            onClick={() => {
              setMode("view");
              setAdding(false);
            }}
          >
            <MousePointer2 className="mr-2 size-4" /> Visualizar
          </Button>
          <Button
            variant={mode === "edit" ? "secondary" : "ghost"}
            size="sm"
            className="rounded-none"
            onClick={() => setMode("edit")}
          >
            <PencilRuler className="mr-2 size-4" /> Editar enlaces
          </Button>
        </div>

        {mode === "edit" && (
          <>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Deshacer cambio de hotspot"
              disabled={pastRef.current.length === 0}
              onClick={undoConfig}
            >
              <Undo2 className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Rehacer cambio de hotspot"
              disabled={futureRef.current.length === 0}
              onClick={redoConfig}
            >
              <Redo2 className="size-4" />
            </Button>
            <Button
              variant={adding ? "default" : "outline"}
              size="sm"
              onClick={() => setAdding((value) => !value)}
            >
              <Plus className="mr-2 size-4" /> {adding ? "Dibuja el rectángulo" : "Añadir hotspot"}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Circle className="mr-2 size-4" /> Botones 3D
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-72" align="start">
                <DropdownMenuLabel>Insertar botón con hipervínculo</DropdownMenuLabel>
                <div className="grid grid-cols-3 gap-2 p-2">
                  {(
                    [
                      ["circle", Circle, "Círculo"],
                      ["square", Square, "Cuadrado"],
                      ["arrow-left", ArrowLeft, "Flecha izquierda"],
                      ["arrow-right", ArrowRight, "Flecha derecha"],
                      ["arrow-up", ArrowUp, "Flecha arriba"],
                      ["arrow-down", ArrowDown, "Flecha abajo"],
                    ] as const
                  ).map(([preset, Icon, label]) => (
                    <DropdownMenuItem
                      key={preset}
                      title={label}
                      aria-label={label}
                      onSelect={() => createPresetButton(preset)}
                      className="flex h-16 cursor-pointer items-center justify-center p-1 focus:bg-transparent"
                    >
                      <span
                        className={`flipbook-3d-button flex h-11 w-14 items-center justify-center text-white ${preset === "circle" ? "w-11 rounded-full" : "rounded-xl"}`}
                      >
                        <Icon className="size-5" strokeWidth={3} />
                      </span>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuItem
                    title="AD Mobility"
                    aria-label="AD Mobility"
                    onSelect={() => createPresetButton("ad-mobility")}
                    className="col-span-3 flex h-24 cursor-pointer items-center justify-center p-2 focus:bg-transparent"
                  >
                    <span className="flipbook-3d-button flipbook-3d-brand flex h-20 w-28 items-center justify-center rounded-2xl">
                      <img
                        src="/brand/ad-mobility.png"
                        alt="AD Mobility"
                        className="size-full object-contain"
                      />
                    </span>
                  </DropdownMenuItem>
                </div>
                <p className="px-3 pb-2 text-xs text-muted-foreground">
                  Después podrás moverlo, cambiar su tamaño y elegir el destino.
                </p>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" size="sm" onClick={() => setAutoMenu(true)}>
              <Wand2 className="mr-2 size-4" /> Crear menú automáticamente
            </Button>
            <Button variant="outline" size="sm" onClick={() => setOutlineOpen(true)}>
              <List className="mr-2 size-4" /> Editar índice
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  Diseño
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>Plantillas del visor</DropdownMenuLabel>
                <DropdownMenuItem
                  onSelect={() =>
                    setConfigWithHistory((prev) => ({
                      ...prev,
                      theme: { background: "#e2e8f0", accent: "#2563eb", sound: false },
                    }))
                  }
                >
                  Profesional azul
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() =>
                    setConfigWithHistory((prev) => ({
                      ...prev,
                      theme: { background: "#fff1f2", accent: "#e85d4a", sound: false },
                    }))
                  }
                >
                  Coral AD Mobility
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() =>
                    setConfigWithHistory((prev) => ({
                      ...prev,
                      theme: { background: "#111827", accent: "#22c55e", sound: true },
                    }))
                  }
                >
                  Presentación oscura
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="lg:hidden">
                  Propiedades
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[min(90vw,22rem)] overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>Propiedades del flipbook</SheetTitle>
                </SheetHeader>
                <div className="mt-5 space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="mobile-menu-page">Página de inicio/menú</Label>
                    <Input
                      id="mobile-menu-page"
                      type="number"
                      min={1}
                      max={pageCount}
                      value={config.menuPage}
                      onChange={(event) =>
                        setConfigWithHistory((prev) => ({
                          ...prev,
                          menuPage: Math.min(
                            Math.max(1, Number(event.target.value) || 1),
                            pageCount,
                          ),
                        }))
                      }
                    />
                  </div>
                  {selected ? (
                    <div className="space-y-3 border-t pt-4">
                      <h3 className="font-medium">Hotspot seleccionado</h3>
                      <Label htmlFor="mobile-label">Nombre accesible</Label>
                      <Input
                        id="mobile-label"
                        value={selected.label ?? ""}
                        placeholder="Ej. Ir al capítulo 2"
                        onChange={(event) =>
                          updateHotspot(selected.id, { label: event.target.value })
                        }
                      />
                      <p className="text-sm text-muted-foreground">
                        {actionLabel(selected, config.menuPage)}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => openDialogFor(selected)}>
                          Editar destino
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => duplicateHotspot(selected)}
                        >
                          <Copy className="mr-1.5 size-4" /> Duplicar
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => removeHotspot(selected.id)}
                        >
                          <Trash2 className="mr-1.5 size-4" /> Eliminar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="border-t pt-4 text-sm text-muted-foreground">
                      Selecciona un hotspot en la página para editarlo.
                    </p>
                  )}
                  <div className="space-y-1 border-t pt-4">
                    <h3 className="font-medium">Hotspots de la página {page}</h3>
                    {pageHotspots.map((hotspot) => (
                      <button
                        key={hotspot.id}
                        onClick={() => setSelectedId(hotspot.id)}
                        className="block w-full rounded-md px-2 py-2 text-left text-sm hover:bg-accent"
                      >
                        {hotspot.label || actionLabel(hotspot, config.menuPage)}
                      </button>
                    ))}
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </>
        )}

        <div className="mx-1 h-6 w-px bg-border" />
        <Button
          variant="ghost"
          size="icon"
          aria-label="Página anterior"
          onClick={() => goToPage(page - 1)}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <Input
          className="h-8 w-16 text-center"
          value={page}
          aria-label="Número de página"
          onChange={(event) => {
            const next = Number(event.target.value);
            if (Number.isFinite(next)) goToPage(next);
          }}
        />
        <span className="text-xs text-muted-foreground">/ {pageCount}</span>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Página siguiente"
          onClick={() => goToPage(page + 1)}
        >
          <ChevronRight className="size-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => goToPage(config.menuPage)}>
          <Home className="mr-2 size-4" /> Menú
        </Button>

        <div className="mx-1 h-6 w-px bg-border" />
        <Button
          variant="ghost"
          size="icon"
          aria-label="Reducir zoom"
          onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.1).toFixed(2))))}
        >
          <ZoomOut className="size-4" />
        </Button>
        <span className="w-12 text-center text-xs text-muted-foreground">
          {Math.round(zoom * 100)}%
        </span>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Aumentar zoom"
          onClick={() => setZoom((z) => Math.min(3, Number((z + 0.1).toFixed(2))))}
        >
          <ZoomIn className="size-4" />
        </Button>

        <div className="ml-auto flex items-center gap-2">
          {effectiveOutline.length > 0 && (
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="sm">
                  <List className="mr-2 size-4" /> Índice
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>Índice del documento</SheetTitle>
                </SheetHeader>
                <ul className="mt-4 space-y-1">
                  {effectiveOutline.map((entry, index) => (
                    <li key={`${entry.title}-${index}`}>
                      <button
                        className="w-full rounded px-2 py-1 text-left text-sm hover:bg-accent"
                        style={{ paddingLeft: `${8 + entry.depth * 12}px` }}
                        onClick={() => goToPage(entry.page)}
                      >
                        {entry.title}
                        <span className="ml-2 text-xs text-muted-foreground">{entry.page}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </SheetContent>
            </Sheet>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" disabled={publishing}>
                <Download className="mr-2 size-4" />
                {publishing ? "Generando…" : "Exportar"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuLabel>Exportar</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => void exportSingleHtml()}>
                <FileCode2 className="mr-2 size-4" />
                <span className="flex flex-col">
                  <span>HTML único para Mac (.html)</span>
                  <span className="text-xs text-muted-foreground">
                    Se abre con doble clic, sin instalar nada
                  </span>
                </span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void exportPublication()}>
                <FileArchive className="mr-2 size-4" />
                <span className="flex flex-col">
                  <span>Flipbook completo (.zip)</span>
                  <span className="text-xs text-muted-foreground">
                    PDF, visor, hotspots e índice para uso local
                  </span>
                </span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void exportConfig()}>
                <FileJson className="mr-2 size-4" />
                Exportar configuración JSON
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" size="sm" onClick={() => importRef.current?.click()}>
            <Upload className="mr-2 size-4" /> Importar
          </Button>
          <Button variant="ghost" size="sm" onClick={() => openRef.current?.click()}>
            Abrir otro PDF
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {mode === "view" ? (
          <FlipbookStage
            pages={pages}
            hotspots={config.hotspots}
            menuPage={config.menuPage}
            zoom={zoom}
            {...(config.theme ? { theme: config.theme } : {})}
            onPageChange={setPage}
            handleRef={flipRef}
          />
        ) : (
          <>
            {currentPage && (
              <HotspotEditor
                page={currentPage}
                hotspots={pageHotspots}
                menuPage={config.menuPage}
                selectedId={selectedId}
                adding={adding}
                zoom={zoom}
                onSelect={setSelectedId}
                onCreate={createHotspot}
                onUpdate={(id, rect, record = true) => updateHotspot(id, rect, record)}
                onEditStart={checkpointConfig}
              />
            )}
            <aside className="hidden w-72 shrink-0 space-y-4 overflow-y-auto border-l border-border bg-card p-4 lg:block">
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Configuración del documento</h3>
                <Label className="text-xs text-muted-foreground" htmlFor="menu-page">
                  Página de inicio/menú
                </Label>
                <Input
                  id="menu-page"
                  type="number"
                  min={1}
                  max={pageCount}
                  value={config.menuPage}
                  onChange={(event) =>
                    setConfigWithHistory((prev) => ({
                      ...prev,
                      menuPage: Math.min(Math.max(1, Number(event.target.value) || 1), pageCount),
                    }))
                  }
                />
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <label className="text-xs text-muted-foreground">
                    Fondo
                    <input
                      type="color"
                      className="mt-1 h-9 w-full rounded border"
                      value={config.theme?.background ?? "#e2e8f0"}
                      onChange={(event) =>
                        setConfigWithHistory((prev) => ({
                          ...prev,
                          theme: { ...prev.theme, background: event.target.value },
                        }))
                      }
                    />
                  </label>
                  <label className="text-xs text-muted-foreground">
                    Color de botones
                    <input
                      type="color"
                      className="mt-1 h-9 w-full rounded border"
                      value={config.theme?.accent ?? "#2563eb"}
                      onChange={(event) =>
                        setConfigWithHistory((prev) => ({
                          ...prev,
                          theme: { ...prev.theme, accent: event.target.value },
                        }))
                      }
                    />
                  </label>
                </div>
                <label className="flex items-center gap-2 pt-1 text-xs">
                  <input
                    type="checkbox"
                    checked={config.theme?.sound ?? false}
                    onChange={(event) =>
                      setConfigWithHistory((prev) => ({
                        ...prev,
                        theme: { ...prev.theme, sound: event.target.checked },
                      }))
                    }
                  />
                  Sonido suave al pasar página
                </label>
              </div>

              <div className="space-y-2 border-t border-border pt-4">
                <h3 className="text-sm font-semibold">Hotspot seleccionado</h3>
                {!selected && (
                  <p className="text-xs text-muted-foreground">
                    Pulsa «Añadir hotspot» y dibuja un rectángulo sobre la página, o selecciona uno
                    existente.
                  </p>
                )}
                {selected && (
                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs text-muted-foreground" htmlFor="hotspot-label">
                        Nombre accesible
                      </Label>
                      <Input
                        id="hotspot-label"
                        value={selected.label ?? ""}
                        placeholder="Ej. Ir al capítulo 2"
                        onChange={(event) =>
                          updateHotspot(selected.id, { label: event.target.value })
                        }
                      />
                    </div>
                    {selected.buttonPreset && (
                      <div className="grid grid-cols-2 gap-2 rounded-lg border p-2">
                        <label className="text-xs text-muted-foreground">
                          Fondo
                          <input
                            type="color"
                            className="mt-1 h-8 w-full"
                            value={selected.style?.background ?? config.theme?.accent ?? "#2563eb"}
                            onChange={(event) =>
                              updateHotspot(selected.id, {
                                style: { ...selected.style, background: event.target.value },
                              })
                            }
                          />
                        </label>
                        <label className="text-xs text-muted-foreground">
                          Texto
                          <input
                            type="color"
                            className="mt-1 h-8 w-full"
                            value={selected.style?.color ?? "#ffffff"}
                            onChange={(event) =>
                              updateHotspot(selected.id, {
                                style: { ...selected.style, color: event.target.value },
                              })
                            }
                          />
                        </label>
                        <label className="col-span-2 text-xs text-muted-foreground">
                          Animación
                          <Select
                            value={selected.style?.animation ?? "none"}
                            onValueChange={(value) =>
                              updateHotspot(selected.id, {
                                style: {
                                  ...selected.style,
                                  animation: value as "none" | "pulse" | "bounce" | "float",
                                },
                              })
                            }
                          >
                            <SelectTrigger className="mt-1 h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Sin animación</SelectItem>
                              <SelectItem value="pulse">Pulso</SelectItem>
                              <SelectItem value="bounce">Rebote</SelectItem>
                              <SelectItem value="float">Flotante</SelectItem>
                            </SelectContent>
                          </Select>
                        </label>
                      </div>
                    )}
                    <div>
                      <Label className="text-xs text-muted-foreground">Destino</Label>
                      <p className="truncate text-sm">{actionLabel(selected, config.menuPage)}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {(["x", "y", "width", "height"] as const).map((field) => (
                        <div key={field}>
                          <Label className="text-xs text-muted-foreground" htmlFor={`f-${field}`}>
                            {{ x: "X", y: "Y", width: "Ancho", height: "Alto" }[field]}
                          </Label>
                          <Input
                            id={`f-${field}`}
                            type="number"
                            value={Math.round(selected[field])}
                            onChange={(event) =>
                              updateHotspot(selected.id, {
                                [field]: Number(event.target.value) || 0,
                              } as Partial<Hotspot>)
                            }
                          />
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => openDialogFor(selected)}>
                        Editar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => duplicateHotspot(selected)}
                      >
                        <Copy className="mr-2 size-4" /> Duplicar
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => removeHotspot(selected.id)}
                      >
                        <Trash2 className="mr-2 size-4" /> Eliminar
                      </Button>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="w-full"
                      onClick={() => {
                        updateHotspot(selected.id, { action: { type: "menu" } });
                        toast.success("Hotspot «Volver al menú» asignado");
                      }}
                    >
                      <Home className="mr-2 size-4" /> Volver al menú
                    </Button>
                  </div>
                )}
              </div>

              <div className="space-y-1 border-t border-border pt-4">
                <h3 className="text-sm font-semibold">
                  Hotspots de la página {page} ({pageHotspots.length})
                </h3>
                {pageHotspots.map((hotspot) => (
                  <button
                    key={hotspot.id}
                    onClick={() => setSelectedId(hotspot.id)}
                    className="block w-full truncate rounded px-2 py-1 text-left text-xs hover:bg-accent"
                  >
                    {actionLabel(hotspot, config.menuPage)}
                  </button>
                ))}
              </div>
            </aside>
          </>
        )}
      </div>

      <Dialog open={!!dialog} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enlace del hotspot</DialogTitle>
          </DialogHeader>
          {dialog && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Tipo de enlace</Label>
                <Select
                  value={dialog.kind}
                  onValueChange={(value) => setDialog({ ...dialog, kind: value as DraftKind })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="page">Página del documento</SelectItem>
                    <SelectItem value="url">URL externa</SelectItem>
                    <SelectItem value="menu">Volver al menú</SelectItem>
                    <SelectItem value="popup">Ventana informativa</SelectItem>
                    <SelectItem value="media">Vídeo, audio o imagen</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {dialog.kind === "page" && (
                <div className="space-y-2">
                  <Label htmlFor="target-page">Página destino</Label>
                  <div className="flex gap-2">
                    <Select
                      value={dialog.targetPage}
                      onValueChange={(value) => setDialog({ ...dialog, targetPage: value })}
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue placeholder="Selecciona" />
                      </SelectTrigger>
                      <SelectContent className="max-h-64">
                        {pages.map((p) => (
                          <SelectItem key={p.number} value={String(p.number)}>
                            Página {p.number}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      id="target-page"
                      type="number"
                      min={1}
                      max={pageCount}
                      value={dialog.targetPage}
                      onChange={(event) => setDialog({ ...dialog, targetPage: event.target.value })}
                    />
                  </div>
                </div>
              )}

              {dialog.kind === "url" && (
                <div className="space-y-2">
                  <Label htmlFor="target-url">URL externa</Label>
                  <Input
                    id="target-url"
                    placeholder="https://ejemplo.com"
                    value={dialog.url}
                    onChange={(event) => setDialog({ ...dialog, url: event.target.value })}
                  />
                </div>
              )}

              {dialog.kind === "menu" && (
                <p className="text-sm text-muted-foreground">
                  Al pulsarlo llevará a la página de menú configurada ({config.menuPage}).
                </p>
              )}
              {dialog.kind === "popup" && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label>Título</Label>
                    <Input
                      value={dialog.title}
                      onChange={(event) => setDialog({ ...dialog, title: event.target.value })}
                      placeholder="Más información"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Contenido</Label>
                    <textarea
                      className="min-h-32 w-full rounded-md border border-input bg-background p-3 text-sm"
                      value={dialog.text}
                      onChange={(event) => setDialog({ ...dialog, text: event.target.value })}
                      placeholder="Texto que aparecerá sin abandonar el flipbook"
                    />
                  </div>
                </div>
              )}
              {dialog.kind === "media" && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label>Tipo</Label>
                    <Select
                      value={dialog.mediaType}
                      onValueChange={(value) =>
                        setDialog({ ...dialog, mediaType: value as typeof dialog.mediaType })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="video">Vídeo</SelectItem>
                        <SelectItem value="audio">Audio</SelectItem>
                        <SelectItem value="image">Imagen</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Título</Label>
                    <Input
                      value={dialog.title}
                      onChange={(event) => setDialog({ ...dialog, title: event.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Archivo local o URL</Label>
                    <div className="flex gap-2">
                      <Input
                        value={dialog.url}
                        onChange={(event) => setDialog({ ...dialog, url: event.target.value })}
                        placeholder="https://... o archivo incrustado"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => mediaRef.current?.click()}
                      >
                        Archivo
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      El archivo local se incrusta en el HTML. Para publicaciones pequeñas usa
                      vídeos comprimidos.
                    </p>
                  </div>
                  <input
                    ref={mediaRef}
                    type="file"
                    accept="video/*,audio/*,image/*"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () =>
                        setDialog((current) =>
                          current
                            ? {
                                ...current,
                                url: String(reader.result),
                                mediaType: file.type.startsWith("audio/")
                                  ? "audio"
                                  : file.type.startsWith("image/")
                                    ? "image"
                                    : "video",
                                title: current.title || file.name,
                              }
                            : current,
                        );
                      reader.readAsDataURL(file);
                    }}
                  />
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialog(null)}>
              Cancelar
            </Button>
            <Button onClick={saveDialog}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AutoMenuDialog
        open={autoMenu}
        onOpenChange={setAutoMenu}
        outline={effectiveOutline}
        menuPage={page}
        pageCount={pageCount}
        pageSize={currentPage ? { width: currentPage.width, height: currentPage.height } : null}
        onCreate={(created) => {
          setConfigWithHistory((prev) => ({
            ...prev,
            hotspots: [...prev.hotspots, ...created],
          }));
          const first = created[0];
          if (first) {
            setSelectedId(first.id);
            goToPage(first.page);
          }
          toast.success(`Menú creado con ${created.length} enlaces`);
        }}
      />
      <OutlineEditorDialog
        open={outlineOpen}
        onOpenChange={setOutlineOpen}
        entries={effectiveOutline}
        pageCount={pageCount}
        onSave={(outline) => setConfigWithHistory((prev) => ({ ...prev, outline }))}
      />

      <input
        ref={openRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void openFile(file);
        }}
      />
      <input
        ref={importRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void importConfig(file);
        }}
      />
    </div>
  );
}
