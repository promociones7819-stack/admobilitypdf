import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Download,
  FilePlus2,
  Layers,
  Loader2,
  Minimize2,
  PanelLeft,
  Redo2,
  Undo2,
  Plus,
  FileType2,
  MoreHorizontal,
  ScanText,
  Wrench,
  Search,
} from "lucide-react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { usePdfEditor, friendlyError } from "@/lib/pdf/store";
import { CompressPdfDialog } from "./CompressPdfDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
        <Button
          variant="ghost"
          size="icon"
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function TopBar({
  onToggleThumbs,
  onOpenFlipbook,
  openCompression,
  onCompressionOpened,
  onOpenTool,
  onSearch,
}: {
  onToggleThumbs: () => void;
  onOpenFlipbook?: () => void;
  openCompression: boolean;
  onCompressionOpened: () => void;
  onOpenTool: (tool: "convert" | "ocr" | "ai" | "pro") => void;
  onSearch: () => void;
}) {
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
    autosaveState,
  } = usePdfEditor();
  const openRef = useRef<HTMLInputElement>(null);
  const mergeRef = useRef<HTMLInputElement>(null);
  const addRef = useRef<HTMLInputElement>(null);
  const [compressOpen, setCompressOpen] = useState(false);

  useEffect(() => {
    if (!openCompression) return;
    setCompressOpen(true);
    onCompressionOpened();
  }, [onCompressionOpened, openCompression]);

  return (
    <>
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
        <Button variant="ghost" size="sm" className="hidden md:inline-flex" onClick={closeDocument}>
          Nuevo
        </Button>

        <div className="mx-1 h-6 w-px bg-border" />
        <IconAction label="Deshacer (Ctrl/Cmd+Z)" onClick={undo} disabled={!canUndo}>
          <Undo2 className="size-4" />
        </IconAction>
        <IconAction label="Rehacer (Ctrl/Cmd+Shift+Z)" onClick={redo} disabled={!canRedo}>
          <Redo2 className="size-4" />
        </IconAction>
        <IconAction label="Buscar en el documento (Ctrl/Cmd+F)" onClick={onSearch}>
          <Search className="size-4" />
        </IconAction>

        <div className="ml-auto flex items-center gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="sm:hidden"
                aria-label="Más herramientas"
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onSelect={() => addRef.current?.click()}>
                <Plus className="mr-2 size-4" /> Añadir páginas
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => mergeRef.current?.click()}>
                <Layers className="mr-2 size-4" /> Combinar PDFs
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={closeDocument}>Nuevo documento</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => onOpenTool("convert")}>
                <FileType2 className="mr-2 size-4" /> Conversores
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!onOpenFlipbook} onSelect={() => onOpenFlipbook?.()}>
                <BookOpen className="mr-2 size-4" /> Crear flipbook
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onOpenTool("ocr")}>
                <ScanText className="mr-2 size-4" /> OCR
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onOpenTool("ai")}>
                <Sparkles className="mr-2 size-4" /> IA Documentos
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onOpenTool("pro")}>
                <Wrench className="mr-2 size-4" /> Herramientas profesionales
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="ghost"
            size="sm"
            className="hidden sm:inline-flex"
            onClick={() => onOpenTool("convert")}
          >
            <FileType2 className="mr-2 size-4" /> Convertir
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="hidden md:inline-flex"
            onClick={onOpenFlipbook}
          >
            <BookOpen className="mr-2 size-4" /> Crear flipbook
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="hidden md:inline-flex"
            onClick={() => onOpenTool("ocr")}
          >
            <ScanText className="mr-2 size-4" /> OCR
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="hidden sm:inline-flex"
            onClick={() => onOpenTool("ai")}
          >
            <Sparkles className="mr-2 size-4" /> IA Documentos
          </Button>
          <IconAction label="Herramientas profesionales" onClick={() => onOpenTool("pro")}>
            <Wrench className="size-4" />
          </IconAction>
          <div className="hidden max-w-[240px] flex-col items-end text-right sm:flex">
            <span className="truncate text-xs font-medium text-foreground">
              {fileName ?? "documento.pdf"}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {autosaveState === "saving"
                ? "Guardando recuperación…"
                : autosaveState === "error"
                  ? "No se pudo autoguardar"
                  : dirty
                    ? "• Cambios sin exportar · recuperables"
                    : "Proyecto recuperable"}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            aria-label="Reducir tamaño del PDF con los cambios"
            onClick={() => setCompressOpen(true)}
          >
            <Minimize2 className="size-4 lg:mr-2" />
            <span className="hidden lg:inline">Reducir tamaño</span>
          </Button>
          <Button
            size="sm"
            disabled={busy}
            onClick={() => {
              void download()
                .then(() => toast.success("PDF guardado"))
                .catch((error) => toast.error(friendlyError(error)));
            }}
          >
            {busy ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Download className="mr-2 size-4" />
            )}
            Guardar PDF
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
      <CompressPdfDialog open={compressOpen} onOpenChange={setCompressOpen} />
    </>
  );
}
