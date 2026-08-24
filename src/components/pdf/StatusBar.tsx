import {
  ChevronLeft,
  ChevronRight,
  Maximize,
  Minus,
  Plus,
  RotateCcw,
  RotateCw,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePdfEditor } from "@/lib/pdf/store";
import { zoomIn, zoomOut, type ZoomMode } from "./zoom";

interface Props {
  zoom: ZoomMode;
  effectiveScale: number;
  setZoom: (zoom: ZoomMode) => void;
}

export function StatusBar({ zoom, effectiveScale, setZoom }: Props) {
  const { pages, activePageId, setActivePage, rotatePages, selection } = usePdfEditor();
  const index = pages.findIndex((p) => p.id === activePageId);
  const current = index === -1 ? 0 : index;
  const [draft, setDraft] = useState("");

  const go = (target: number) => {
    const page = pages[Math.max(0, Math.min(target, pages.length - 1))];
    if (page) setActivePage(page.id);
  };

  const rotateTargets = selection.length > 0 ? selection : activePageId ? [activePageId] : [];

  return (
    <footer className="flex h-12 shrink-0 flex-wrap items-center gap-1 border-t border-border bg-card px-2 sm:px-4">
      <Button variant="ghost" size="icon" onClick={() => go(current - 1)} disabled={current <= 0}>
        <span className="sr-only">Página anterior</span>
        <ChevronLeft className="size-4" />
      </Button>
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <span className="hidden sm:inline">Página</span>
        <Input
          className="h-7 w-12 text-center text-xs"
          value={draft === "" ? String(current + 1) : draft}
          onChange={(e) => setDraft(e.target.value.replace(/\D/g, ""))}
          onBlur={() => {
            if (draft) go(Number(draft) - 1);
            setDraft("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              if (draft) go(Number(draft) - 1);
              setDraft("");
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
        <span>/ {pages.length}</span>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => go(current + 1)}
        disabled={current >= pages.length - 1}
      >
        <span className="sr-only">Página siguiente</span>
        <ChevronRight className="size-4" />
      </Button>

      <div className="mx-2 h-6 w-px bg-border" />

      <Button variant="ghost" size="icon" onClick={() => setZoom(zoomOut(effectiveScale))}>
        <span className="sr-only">Reducir zoom</span>
        <Minus className="size-4" />
      </Button>
      <button
        className="min-w-14 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
        onClick={() => setZoom(1)}
        title="Restablecer al 100%"
      >
        {Math.round(effectiveScale * 100)}%
      </button>
      <Button variant="ghost" size="icon" onClick={() => setZoom(zoomIn(effectiveScale))}>
        <span className="sr-only">Aumentar zoom</span>
        <Plus className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="hidden text-xs sm:inline-flex"
        onClick={() => setZoom("fit-page")}
      >
        <Maximize className="mr-1.5 size-3.5" />
        Ajustar
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="hidden text-xs md:inline-flex"
        onClick={() => setZoom("fit-width")}
      >
        Ancho
      </Button>

      <div className="mx-2 h-6 w-px bg-border" />
      <Button variant="ghost" size="icon" onClick={() => rotatePages(rotateTargets, -90)}>
        <span className="sr-only">Rotar páginas a la izquierda</span>
        <RotateCcw className="size-4" />
      </Button>
      <Button variant="ghost" size="icon" onClick={() => rotatePages(rotateTargets, 90)}>
        <span className="sr-only">Rotar páginas a la derecha</span>
        <RotateCw className="size-4" />
      </Button>

      <span className="ml-auto hidden items-center gap-1.5 text-[11px] text-muted-foreground lg:flex">
        <ShieldCheck className="size-3.5" />
        Tu documento se procesa localmente en tu navegador. Zoom actual:{" "}
        {zoom === "fit-page"
          ? "ajustado"
          : zoom === "fit-width"
            ? "ancho"
            : `${Math.round(effectiveScale * 100)}%`}
      </span>
    </footer>
  );
}
