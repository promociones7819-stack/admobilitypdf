import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { TooltipProvider } from "@/components/ui/tooltip";
import { usePdfEditor } from "@/lib/pdf/store";
import { PageViewer } from "./PageViewer";
import { PageToolsRail } from "./PageToolsRail";
import { StatusBar } from "./StatusBar";
import { TopBar } from "./TopBar";

import { ThumbnailPanel } from "./ThumbnailPanel";
import { zoomIn, zoomOut, type ZoomMode } from "./zoom";

export function Editor() {
  const { pages, activePageId, setActivePage, undo, redo, duplicatePages, selection } =
    usePdfEditor();
  const [zoom, setZoom] = useState<ZoomMode>("fit-page");
  const [effectiveScale, setEffectiveScale] = useState(1);
  const [thumbsOpen, setThumbsOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;
      const mod = event.metaKey || event.ctrlKey;

      if (mod && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && event.key.toLowerCase() === "d") {
        event.preventDefault();
        duplicatePages(selection.length ? selection : activePageId ? [activePageId] : []);
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
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        const index = pages.findIndex((p) => p.id === activePageId);
        const next = pages[index + (event.key === "ArrowRight" ? 1 : -1)];
        if (next) {
          event.preventDefault();
          setActivePage(next.id);
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activePageId, duplicatePages, effectiveScale, pages, redo, selection, setActivePage, undo]);

  return (
    <TooltipProvider delayDuration={200}>
    <div className="flex h-screen flex-col bg-canvas">
      <TopBar onToggleThumbs={() => setThumbsOpen(true)} />
      <div className="flex flex-1 overflow-hidden">
        <aside className="hidden w-56 shrink-0 border-r border-border bg-card lg:block">
          <ThumbnailPanel />
        </aside>
        <PageToolsRail />
        <div className="flex min-w-0 flex-1 flex-col">
          <PageViewer zoom={zoom} onEffectiveScale={setEffectiveScale} />
          <StatusBar zoom={zoom} effectiveScale={effectiveScale} setZoom={setZoom} />
        </div>
      </div>

      <Sheet open={thumbsOpen} onOpenChange={setThumbsOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <SheetTitle className="sr-only">Páginas</SheetTitle>
          <ThumbnailPanel />
        </SheetContent>
      </Sheet>
    </div>
    </TooltipProvider>
  );
}

