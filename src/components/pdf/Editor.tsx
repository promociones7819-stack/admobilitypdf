import { useEffect, useRef, useState } from "react";
import { Layers3 } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { TooltipProvider } from "@/components/ui/tooltip";
import { usePdfEditor } from "@/lib/pdf/store";
import type { ToolId } from "@/lib/pdf/annotations";
import type { Annotation } from "@/lib/pdf/annotations";
import { makeId } from "@/lib/pdf/types";
import { PageViewer } from "./PageViewer";
import { AnnotationRail } from "./AnnotationRail";
import { AnnotationOptions } from "./AnnotationOptions";
import { StatusBar } from "./StatusBar";
import { TopBar } from "./TopBar";
import { SearchDialog } from "./SearchDialog";
import { DesignLayersPanel } from "./DesignLayersPanel";

import { ThumbnailPanel } from "./ThumbnailPanel";
import { zoomIn, zoomOut, type ZoomMode } from "./zoom";

export function Editor({
  onOpenFlipbook,
  openCompression,
  onCompressionOpened,
  onOpenTool,
}: {
  onOpenFlipbook?: () => void;
  openCompression: boolean;
  onCompressionOpened: () => void;
  onOpenTool: (tool: "convert" | "ocr" | "ai" | "pro") => void;
}) {
  const {
    pages,
    annotations,
    activePageId,
    selectedAnnotationId,
    selectedAnnotationIds,
    setActivePage,
    undo,
    redo,
    duplicatePages,
    duplicateAnnotation,
    addAnnotation,
    moveAnnotations,
    selection,
    setTool,
  } = usePdfEditor();
  const [zoom, setZoom] = useState<ZoomMode>("fit-page");
  const [effectiveScale, setEffectiveScale] = useState(1);
  const [thumbsOpen, setThumbsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [designMode, setDesignMode] = useState(false);
  const clipboardRef = useRef<Annotation | null>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      // Never hijack native shortcuts while the user types (Mac Cmd+A/C/V/X/Z).
      if (target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable))
        return;
      const mod = event.metaKey || event.ctrlKey;

      if (mod && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setSearchOpen(true);
        return;
      }

      if (mod && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && event.key.toLowerCase() === "d") {
        event.preventDefault();
        if (selectedAnnotationId) duplicateAnnotation(selectedAnnotationId);
        else duplicatePages(selection.length ? selection : activePageId ? [activePageId] : []);
        return;
      }
      if (mod && event.key.toLowerCase() === "c" && selectedAnnotationId) {
        const selected = annotations.find((annotation) => annotation.id === selectedAnnotationId);
        if (selected) clipboardRef.current = structuredClone(selected);
        return;
      }
      if (mod && event.key.toLowerCase() === "v" && clipboardRef.current && activePageId) {
        event.preventDefault();
        const source = clipboardRef.current;
        addAnnotation({
          ...structuredClone(source),
          id: makeId("ann"),
          groupId: undefined,
          pageId: activePageId,
          x: Math.min(1 - source.width, source.x + 0.02),
          y: Math.min(1 - source.height, source.y + 0.02),
        });
        return;
      }
      if (mod && (event.key === "+" || event.key === "=")) {
        event.preventDefault();
        setZoom(zoomIn(effectiveScale));
        return;
      }
      if (mod && event.key === "-") {
        event.preventDefault();
        setZoom(zoomOut(effectiveScale));
        return;
      }
      if (!mod && !event.altKey) {
        const shortcuts: Record<string, ToolId> = {
          v: "select",
          t: "text",
          h: "highlight",
          u: "underline",
          s: "strike",
          p: "ink",
          r: "rect",
          o: "ellipse",
          i: "image",
          b: "studyCover",
        };
        const next = shortcuts[event.key.toLowerCase()];
        if (next) {
          event.preventDefault();
          setTool(next);
          return;
        }
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        if (selectedAnnotationIds.length) {
          event.preventDefault();
          const step = event.shiftKey ? 0.01 : 0.002;
          moveAnnotations(selectedAnnotationIds, event.key === "ArrowRight" ? step : -step, 0);
          return;
        }
        const index = pages.findIndex((p) => p.id === activePageId);
        const next = pages[index + (event.key === "ArrowRight" ? 1 : -1)];
        if (next) {
          event.preventDefault();
          setActivePage(next.id);
        }
      }
      if ((event.key === "ArrowUp" || event.key === "ArrowDown") && selectedAnnotationIds.length) {
        event.preventDefault();
        const step = event.shiftKey ? 0.01 : 0.002;
        moveAnnotations(selectedAnnotationIds, 0, event.key === "ArrowDown" ? step : -step);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    activePageId,
    addAnnotation,
    annotations,
    duplicateAnnotation,
    duplicatePages,
    effectiveScale,
    pages,
    moveAnnotations,
    redo,
    selection,
    selectedAnnotationId,
    selectedAnnotationIds,
    setActivePage,
    setTool,
    undo,
  ]);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-full flex-col bg-canvas">
        <TopBar
          onToggleThumbs={() => setThumbsOpen(true)}
          openCompression={openCompression}
          onCompressionOpened={onCompressionOpened}
          onOpenTool={onOpenTool}
          onSearch={() => setSearchOpen(true)}
          {...(onOpenFlipbook ? { onOpenFlipbook } : {})}
        />
        <div className="flex flex-1 overflow-hidden">
          <aside className="hidden w-56 shrink-0 border-r border-border bg-card lg:block">
            <ThumbnailPanel />
          </aside>
          <AnnotationRail />
          <div className="flex min-w-0 flex-1 flex-col">
            <AnnotationOptions />
            <div className="relative flex min-h-0 flex-1">
              <PageViewer zoom={zoom} onEffectiveScale={setEffectiveScale} />
              {!designMode && (
                <button
                  onClick={() => {
                    setDesignMode(true);
                    setTool("select");
                  }}
                  className="absolute right-4 top-4 z-20 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-card px-3 py-2 text-xs font-medium shadow-lg hover:bg-accent"
                >
                  <Layers3 className="size-4 text-primary" /> Modo diseño
                </button>
              )}
              {designMode && <DesignLayersPanel onClose={() => setDesignMode(false)} />}
            </div>
            <StatusBar zoom={zoom} effectiveScale={effectiveScale} setZoom={setZoom} />
          </div>
        </div>

        <Sheet open={thumbsOpen} onOpenChange={setThumbsOpen}>
          <SheetContent side="left" className="w-64 p-0">
            <SheetTitle className="sr-only">Páginas</SheetTitle>
            <ThumbnailPanel />
          </SheetContent>
        </Sheet>
        <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
      </div>
    </TooltipProvider>
  );
}
