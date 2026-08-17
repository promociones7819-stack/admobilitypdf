import {
  Copy,
  Download,
  MousePointer2,
  RotateCcw,
  RotateCw,
  Scissors,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { usePdfEditor, friendlyError } from "@/lib/pdf/store";

interface RailButtonProps {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function RailButton({ label, active, onClick, children }: RailButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          aria-label={label}
          className={`inline-flex size-10 items-center justify-center rounded-lg border transition-colors ${
            active
              ? "border-primary bg-primary/10 text-primary"
              : "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground"
          }`}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

export function PageToolsRail() {
  const { selection, activePageId, rotatePages, duplicatePages, deletePages, extractPages } =
    usePdfEditor();
  const targets = selection.length > 0 ? selection : activePageId ? [activePageId] : [];

  return (
    <aside className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-border bg-card py-3">
      <RailButton label="Seleccionar páginas" active onClick={() => undefined}>
        <MousePointer2 className="size-4" />
      </RailButton>
      <div className="my-1 h-px w-7 bg-border" />
      <RailButton label="Rotar a la derecha" onClick={() => rotatePages(targets, 90)}>
        <RotateCw className="size-4" />
      </RailButton>
      <RailButton label="Rotar a la izquierda" onClick={() => rotatePages(targets, -90)}>
        <RotateCcw className="size-4" />
      </RailButton>
      <RailButton label="Duplicar" onClick={() => duplicatePages(targets)}>
        <Copy className="size-4" />
      </RailButton>
      <RailButton
        label="Extraer a un PDF nuevo"
        onClick={() => {
          if (targets.length === 0) return;
          void extractPages(targets)
            .then(() => toast.success("Páginas extraídas"))
            .catch((error) => toast.error(friendlyError(error)));
        }}
      >
        <Scissors className="size-4" />
      </RailButton>
      <RailButton
        label="Descargar selección"
        onClick={() => {
          if (targets.length === 0) return;
          void extractPages(targets).catch((error) => toast.error(friendlyError(error)));
        }}
      >
        <Download className="size-4" />
      </RailButton>
      <RailButton
        label="Eliminar"
        onClick={() => {
          if (targets.length === 0) return;
          if (targets.length > 1 && !window.confirm(`¿Eliminar ${targets.length} páginas?`))
            return;
          deletePages(targets);
        }}
      >
        <Trash2 className="size-4" />
      </RailButton>
    </aside>
  );
}
