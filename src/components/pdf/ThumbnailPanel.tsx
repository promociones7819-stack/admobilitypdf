import { useEffect, useRef, useState } from "react";
import {
  Copy,
  Download,
  RotateCcw,
  RotateCw,
  Trash2,
  FilePlus,
  FileStack,

} from "lucide-react";
import { toast } from "sonner";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { renderThumbnail } from "@/lib/pdf/render";
import { usePdfEditor, friendlyError } from "@/lib/pdf/store";
import type { PageEntry } from "@/lib/pdf/types";

function Thumbnail({ page, index }: { page: PageEntry; index: number }) {
  const { sources } = usePdfEditor();
  const [url, setUrl] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { root: el.closest("[data-thumb-scroll]"), rootMargin: "300px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || page.blank) return;
    const source = sources[page.sourceId];
    if (!source) return;
    let cancelled = false;
    renderThumbnail(source.doc, page.sourceIndex, page.rotation, 160)
      .then((dataUrl) => {
        if (!cancelled) setUrl(dataUrl);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [visible, page.blank, page.rotation, page.sourceId, page.sourceIndex, sources]);

  if (page.blank) {
    const ratio = page.blank.height / page.blank.width;
    const swapped = page.rotation % 180 === 90;
    const width = 130;
    return (
      <div ref={ref} className="w-full">
        <div
          className="mx-auto flex items-center justify-center rounded-sm border border-dashed border-border bg-white text-[10px] text-muted-foreground shadow-sm"
          style={{
            width,
            height: Math.round(swapped ? width / ratio : width * ratio),
          }}
        >
          En blanco
        </div>
      </div>
    );
  }

  return (
    <div ref={ref} className="w-full">
      {url ? (
        <img
          src={url}
          alt={`Página ${index + 1}`}
          className="mx-auto block max-h-[220px] w-auto max-w-full rounded-sm bg-white shadow-sm"
        />
      ) : (
        <div className="mx-auto h-[180px] w-[130px] animate-pulse rounded-sm bg-muted" />
      )}
    </div>
  );
}


export function ThumbnailPanel() {
  const {
    pages,
    selection,
    activePageId,
    toggleSelection,
    setActivePage,
    deletePages,
    duplicatePages,
    rotatePages,
    movePage,
    extractPages,
    importFiles,
    addBlankPage,

  } = usePdfEditor();
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const insertAfterRef = useRef<string | null>(null);

  function confirmDelete(ids: string[]) {
    if (ids.length > 1 && !window.confirm(`¿Eliminar ${ids.length} páginas?`)) return;
    deletePages(ids);
  }

  function targets(pageId: string): string[] {
    return selection.includes(pageId) ? selection : [pageId];
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Páginas ({pages.length})
        </span>
        <div className="flex items-center gap-1">
          <button
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            onClick={() => {
              void addBlankPage(null).catch((e) => toast.error(friendlyError(e)));
            }}
            title="Insertar página en blanco al final"
          >
            <FileStack className="size-3.5" /> En blanco
          </button>
          <button
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            onClick={() => {
              insertAfterRef.current = null;
              importRef.current?.click();
            }}
          >
            <FilePlus className="size-3.5" /> Añadir
          </button>
        </div>

      </div>

      <div data-thumb-scroll className="flex-1 space-y-2 overflow-y-auto p-3">
        {pages.map((page, index) => {
          const isSelected = selection.includes(page.id);
          const isActive = page.id === activePageId;
          return (
            <div key={page.id}>
              {dropIndex === index && dragId && (
                <div className="mb-2 h-0.5 rounded bg-primary" />
              )}
              <ContextMenu>
                <ContextMenuTrigger asChild>
                  <div
                    draggable
                    onDragStart={() => setDragId(page.id)}
                    onDragEnd={() => {
                      setDragId(null);
                      setDropIndex(null);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      const rect = e.currentTarget.getBoundingClientRect();
                      const after = e.clientY > rect.top + rect.height / 2;
                      setDropIndex(index + (after ? 1 : 0));
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragId && dropIndex !== null) movePage(dragId, dropIndex);
                      setDragId(null);
                      setDropIndex(null);
                    }}
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey) toggleSelection(page.id, true);
                      else setActivePage(page.id);
                    }}
                    className={`cursor-pointer rounded-lg border p-2 transition-all ${
                      isActive
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : isSelected
                          ? "border-primary/50 bg-primary/5"
                          : "border-border bg-card hover:border-muted-foreground/40"
                    }`}
                  >
                    <Thumbnail page={page} index={index} />
                    <div className="mt-2 text-center text-xs text-muted-foreground">
                      {index + 1}
                    </div>
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-52">
                  <ContextMenuItem onClick={() => duplicatePages(targets(page.id))}>
                    <Copy className="mr-2 size-4" /> Duplicar página
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => rotatePages(targets(page.id), 90)}>
                    <RotateCw className="mr-2 size-4" /> Rotar a la derecha
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => rotatePages(targets(page.id), -90)}>
                    <RotateCcw className="mr-2 size-4" /> Rotar a la izquierda
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    onClick={() => {
                      void extractPages(targets(page.id)).catch((e) =>
                        toast.error(friendlyError(e)),
                      );
                    }}
                  >
                    <Download className="mr-2 size-4" /> Extraer página
                  </ContextMenuItem>
                  <ContextMenuItem
                    onClick={() => {
                      void addBlankPage(page.id).catch((e: unknown) =>
                        toast.error(friendlyError(e)),
                      );
                    }}
                  >
                    <FileStack className="mr-2 size-4" /> Insertar página en blanco
                  </ContextMenuItem>


                  <ContextMenuItem
                    onClick={() => {
                      insertAfterRef.current =
                        index > 0 ? (pages[index - 1]?.id ?? null) : null;
                      importRef.current?.click();
                    }}
                  >
                    <FilePlus className="mr-2 size-4" /> Añadir páginas antes
                  </ContextMenuItem>
                  <ContextMenuItem
                    onClick={() => {
                      insertAfterRef.current = page.id;
                      importRef.current?.click();
                    }}
                  >
                    <FilePlus className="mr-2 size-4" /> Añadir páginas después
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => confirmDelete(targets(page.id))}
                  >

                    <Trash2 className="mr-2 size-4" /> Eliminar página
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            </div>
          );
        })}
        {dropIndex === pages.length && dragId && (
          <div className="h-0.5 rounded bg-primary" />
        )}
      </div>

      <input
        ref={importRef}
        type="file"
        accept="application/pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length === 0) return;
          void importFiles(files, insertAfterRef.current)
            .then(() => toast.success("Páginas añadidas"))
            .catch((error) => toast.error(friendlyError(error)));
        }}
      />
    </div>
  );
}
