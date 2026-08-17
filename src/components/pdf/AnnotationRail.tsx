import {
  Copy,
  Highlighter,
  Image as ImageIcon,
  MousePointer2,
  Pencil,
  RotateCcw,
  RotateCw,
  Scissors,
  Square,
  Strikethrough,
  Trash2,
  Type,
  Underline,
  Circle,
} from "lucide-react";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { usePdfEditor, friendlyError } from "@/lib/pdf/store";
import { TOOL_LABELS, type ToolId } from "@/lib/pdf/annotations";

function RailButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
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

const TOOLS: { id: ToolId; icon: React.ReactNode }[] = [
  { id: "select", icon: <MousePointer2 className="size-4" /> },
  { id: "text", icon: <Type className="size-4" /> },
  { id: "highlight", icon: <Highlighter className="size-4" /> },
  { id: "underline", icon: <Underline className="size-4" /> },
  { id: "strike", icon: <Strikethrough className="size-4" /> },
  { id: "ink", icon: <Pencil className="size-4" /> },
  { id: "rect", icon: <Square className="size-4" /> },
  { id: "ellipse", icon: <Circle className="size-4" /> },
  { id: "image", icon: <ImageIcon className="size-4" /> },
];

export function AnnotationRail() {
  const {
    tool,
    setTool,
    selection,
    activePageId,
    rotatePages,
    duplicatePages,
    deletePages,
    extractPages,
  } = usePdfEditor();
  const targets = selection.length > 0 ? selection : activePageId ? [activePageId] : [];

  return (
    <aside className="flex w-14 shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-border bg-card py-3">
      {TOOLS.map((entry) => (
        <RailButton
          key={entry.id}
          label={TOOL_LABELS[entry.id]}
          active={tool === entry.id}
          onClick={() => setTool(entry.id)}
        >
          {entry.icon}
        </RailButton>
      ))}

      <div className="my-1 h-px w-7 bg-border" />

      <RailButton label="Rotar a la derecha" onClick={() => rotatePages(targets, 90)}>
        <RotateCw className="size-4" />
      </RailButton>
      <RailButton label="Rotar a la izquierda" onClick={() => rotatePages(targets, -90)}>
        <RotateCcw className="size-4" />
      </RailButton>
      <RailButton label="Duplicar página" onClick={() => duplicatePages(targets)}>
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
        label="Eliminar página"
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
