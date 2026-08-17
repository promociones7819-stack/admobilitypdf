import { useRef } from "react";
import {
  Download,
  FilePlus2,
  Layers,
  Loader2,
  PanelLeft,
  Redo2,
  Undo2,
  Plus,
  FileType2,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { usePdfEditor, friendlyError } from "@/lib/pdf/store";

function IconAction({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" onClick={onClick} disabled={disabled}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function TopBar({ onToggleThumbs }: { onToggleThumbs: () => void }) {
  const {
    fileName,
    dirty,
    busy,
    canUndo,
    canRedo,
    undo,
    redo,
    download,
    openFiles,
    importFiles,
    closeDocument,
  } = usePdfEditor();
  const openRef = useRef<HTMLInputElement>(null);
  const mergeRef = useRef<HTMLInputElement>(null);
  const addRef = useRef<HTMLInputElement>(null);

  return (
    <header className="flex h-14 shrink-0 items-center gap-1 border-b border-border bg-card px-2 sm:px-4">
      <button
        className="mr-1 inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent lg:hidden"
        onClick={onToggleThumbs}
        aria-label="Mostrar páginas"
      >
        <PanelLeft className="size-4" />
      </button>
      <div className="mr-3 hidden items-center gap-2 sm:flex">
        <span className="inline-flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Layers className="size-4" />
        </span>
        <span className="text-sm font-semibold tracking-tight">Editor PDF</span>
      </div>

      <Button variant="ghost" size="sm" onClick={() => openRef.current?.click()}>
        <FilePlus2 className="mr-2 size-4" /> Abrir
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="hidden sm:inline-flex"
        onClick={() => addRef.current?.click()}
      >
        <Plus className="mr-2 size-4" /> Añadir páginas
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="hidden sm:inline-flex"
        onClick={() => mergeRef.current?.click()}
      >
        <Layers className="mr-2 size-4" /> Combinar
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="hidden md:inline-flex"
        onClick={closeDocument}
      >
        Nuevo
      </Button>

      <div className="mx-1 h-6 w-px bg-border" />
      <IconAction label="Deshacer (Ctrl+Z)" onClick={undo} disabled={!canUndo}>
        <Undo2 className="size-4" />
      </IconAction>
      <IconAction label="Rehacer (Ctrl+Shift+Z)" onClick={redo} disabled={!canRedo}>
        <Redo2 className="size-4" />
      </IconAction>

      <div className="ml-auto flex items-center gap-3">
        <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
          <Link to="/convertir">
            <FileType2 className="mr-2 size-4" /> Word ⇄ PDF
          </Link>
        </Button>
        <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
          <Link to="/ia">
            <Sparkles className="mr-2 size-4" /> IA Documentos
          </Link>
        </Button>
        <div className="hidden max-w-[240px] flex-col items-end text-right sm:flex">
          <span className="truncate text-xs font-medium text-foreground">
            {fileName ?? "documento.pdf"}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {dirty ? "• Cambios sin guardar" : "Sin cambios pendientes"}
          </span>
        </div>
        <Button
          size="sm"
          disabled={busy}
          onClick={() => {
            void download()
              .then(() => toast.success("PDF descargado"))
              .catch((error) => toast.error(friendlyError(error)));
          }}
        >
          {busy ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Download className="mr-2 size-4" />
          )}
          Descargar PDF
        </Button>
      </div>

      <input
        ref={openRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length)
            void openFiles(files).catch((error) => toast.error(friendlyError(error)));
        }}
      />
      <input
        ref={mergeRef}
        type="file"
        accept="application/pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length)
            void importFiles(files, null)
              .then(() => toast.success("PDFs combinados al final del documento"))
              .catch((error) => toast.error(friendlyError(error)));
        }}
      />
      <input
        ref={addRef}
        type="file"
        accept="application/pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length)
            void importFiles(files, null)
              .then(() => toast.success("Páginas añadidas"))
              .catch((error) => toast.error(friendlyError(error)));
        }}
      />
    </header>
  );
}
