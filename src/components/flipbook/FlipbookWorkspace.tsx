import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Home,
  List,
  MousePointer2,
  PencilRuler,
  Plus,
  Trash2,
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { loadFlipbookDocument, type FlipbookDocument } from "@/lib/flipbook/document";
import {
  documentKey,
  loadConfig,
  makeHotspotId,
  normalizeConfig,
  safeExternalUrl,
  saveConfig,
  actionLabel,
  EMPTY_CONFIG,
  type FlipbookConfig,
  type Hotspot,
  type HotspotAction,
} from "@/lib/flipbook/hotspots";
import { saveBlob } from "@/lib/download";
import { FlipbookStage, type FlipbookHandle } from "./FlipbookStage";
import { HotspotEditor } from "./HotspotEditor";

type Mode = "view" | "edit";
type DraftKind = "page" | "url" | "menu";

interface Geometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function FlipbookWorkspace() {
  const [doc, setDoc] = useState<FlipbookDocument | null>(null);
  const [docName, setDocName] = useState<string>("");
  const [storageKey, setStorageKey] = useState<string | null>(null);
  const [loading, setLoading] = useState<{ done: number; total: number } | null>(null);
  const [config, setConfig] = useState<FlipbookConfig>(EMPTY_CONFIG);
  const [mode, setMode] = useState<Mode>("view");
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [adding, setAdding] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [autoMenu, setAutoMenu] = useState(false);

  const [dialog, setDialog] = useState<{ id: string; kind: DraftKind; targetPage: string; url: string } | null>(
    null,
  );
  const openRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const flipRef = useRef<FlipbookHandle>(null);

  const pages = doc?.pages ?? [];
  const pageCount = pages.length;
  const currentPage = pages[Math.min(page, pageCount) - 1] ?? null;
  const selected = config.hotspots.find((h) => h.id === selectedId) ?? null;
  const pageHotspots = useMemo(
    () => config.hotspots.filter((h) => h.page === page),
    [config.hotspots, page],
  );

  // Persistencia local automática (localStorage), por documento.
  useEffect(() => {
    if (storageKey) saveConfig(storageKey, config);
  }, [config, storageKey]);

  const openFile = useCallback(async (file: File) => {
    if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) {
      toast.error("Solo se admiten archivos PDF.");
      return;
    }
    setLoading({ done: 0, total: 0 });
    try {
      const loaded = await loadFlipbookDocument(file, (done, total) => setLoading({ done, total }));
      const key = documentKey(file);
      setDoc(loaded);
      setDocName(file.name);
      setStorageKey(key);
      setConfig(loadConfig(key));
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

  const goToPage = useCallback(
    (target: number) => {
      const next = Math.min(Math.max(target, 1), pageCount || 1);
      setPage(next);
      if (mode === "view") flipRef.current?.flipTo(next);
    },
    [mode, pageCount],
  );

  const updateHotspot = (id: string, patch: Partial<Hotspot>) =>
    setConfig((prev) => ({
      ...prev,
      hotspots: prev.hotspots.map((h) => (h.id === id ? { ...h, ...patch } : h)),
    }));

  const createHotspot = (geometry: Geometry) => {
    const hotspot: Hotspot = {
      id: makeHotspotId(),
      page,
      ...geometry,
      action: { type: "page", targetPage: config.menuPage },
    };
    setConfig((prev) => ({ ...prev, hotspots: [...prev.hotspots, hotspot] }));
    setSelectedId(hotspot.id);
    setAdding(false);
    setDialog({ id: hotspot.id, kind: "page", targetPage: String(config.menuPage), url: "" });
  };

  const openDialogFor = (hotspot: Hotspot) =>
    setDialog({
      id: hotspot.id,
      kind: hotspot.action.type,
      targetPage:
        hotspot.action.type === "page" ? String(hotspot.action.targetPage) : String(config.menuPage),
      url: hotspot.action.type === "url" ? hotspot.action.url : "",
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
    setConfig((prev) => ({ ...prev, hotspots: [...prev.hotspots, copy] }));
    setSelectedId(copy.id);
  };

  const removeHotspot = (id: string) => {
    setConfig((prev) => ({ ...prev, hotspots: prev.hotspots.filter((h) => h.id !== id) }));
    setSelectedId(null);
  };

  const exportConfig = async () => {
    const json = JSON.stringify(config, null, 2);
    await saveBlob(new Blob([json], { type: "application/json" }), `${docName || "flipbook"}.hotspots.json`);
    toast.success("Configuración exportada");
  };

  const importConfig = async (file: File) => {
    try {
      const parsed = normalizeConfig(JSON.parse(await file.text()));
      setConfig(parsed);
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
          <h2 className="text-lg font-semibold tracking-tight">Flipbook con enlaces interactivos</h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Abre un PDF para verlo como libro y añadir hotspots que salten a otras páginas, a una URL
            o al menú del documento. Todo el proceso ocurre en tu navegador.
          </p>
        </div>
        <Button onClick={() => openRef.current?.click()} disabled={!!loading}>
          {loading
            ? `Preparando páginas ${loading.done}/${loading.total || "…"}`
            : "Abrir PDF"}
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
    <div className="flex h-[calc(100svh-3.5rem)] flex-col">
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
              variant={adding ? "default" : "outline"}
              size="sm"
              onClick={() => setAdding((value) => !value)}
            >
              <Plus className="mr-2 size-4" /> {adding ? "Dibuja el rectángulo" : "Añadir hotspot"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setAutoMenu(true)}>
              <Wand2 className="mr-2 size-4" /> Crear menú automáticamente
            </Button>
          </>
        )}


        <div className="mx-1 h-6 w-px bg-border" />
        <Button variant="ghost" size="icon" aria-label="Página anterior" onClick={() => goToPage(page - 1)}>
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
        <Button variant="ghost" size="icon" aria-label="Página siguiente" onClick={() => goToPage(page + 1)}>
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
          {doc.outline.length > 0 && (
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
                  {doc.outline.map((entry, index) => (
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
          <Button variant="ghost" size="sm" onClick={() => void exportConfig()}>
            <Download className="mr-2 size-4" /> Exportar
          </Button>
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
                onUpdate={(id, rect) => updateHotspot(id, rect)}
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
                    setConfig((prev) => ({
                      ...prev,
                      menuPage: Math.min(Math.max(1, Number(event.target.value) || 1), pageCount),
                    }))
                  }
                />
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
                      <Button size="sm" variant="outline" onClick={() => duplicateHotspot(selected)}>
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
        outline={doc.outline}
        menuPage={page}
        pageCount={pageCount}
        pageSize={currentPage ? { width: currentPage.width, height: currentPage.height } : null}
        onCreate={(created) => {
          setConfig((prev) => ({ ...prev, hotspots: [...prev.hotspots, ...created] }));
          const first = created[0];
          if (first) {
            setSelectedId(first.id);
            goToPage(first.page);
          }
          toast.success(`Menú creado con ${created.length} enlaces`);
        }}
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
