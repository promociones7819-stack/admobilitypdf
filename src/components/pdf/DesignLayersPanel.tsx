import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  Group,
  Layers3,
  Lock,
  Trash2,
  Ungroup,
  Unlock,
  X,
} from "lucide-react";
import { TOOL_LABELS } from "@/lib/pdf/annotations";
import { usePdfEditor } from "@/lib/pdf/store";

const alignActions = [
  ["left", AlignStartVertical, "Alinear a la izquierda"],
  ["center", AlignCenterVertical, "Centrar horizontalmente"],
  ["right", AlignEndVertical, "Alinear a la derecha"],
  ["top", AlignStartHorizontal, "Alinear arriba"],
  ["middle", AlignCenterHorizontal, "Centrar verticalmente"],
  ["bottom", AlignEndHorizontal, "Alinear abajo"],
  ["horizontal", AlignHorizontalDistributeCenter, "Distribuir horizontalmente"],
  ["vertical", AlignVerticalDistributeCenter, "Distribuir verticalmente"],
] as const;

export function DesignLayersPanel({ onClose }: { onClose: () => void }) {
  const {
    annotations,
    activePageId,
    selectedAnnotationIds,
    setSelectedAnnotations,
    toggleAnnotationSelection,
    updateAnnotation,
    updateAnnotations,
    deleteAnnotations,
    reorderAnnotation,
    alignAnnotations,
    groupAnnotations,
    ungroupAnnotations,
  } = usePdfEditor();
  const layers = annotations.filter((item) => item.pageId === activePageId).reverse();
  const selected = annotations.filter((item) => selectedAnnotationIds.includes(item.id));
  const editableSelected = selected.filter((item) => !item.locked);
  const hasGroup = selected.some((item) => item.groupId);

  return (
    <aside
      className="flex h-full w-72 shrink-0 flex-col border-l border-border bg-card shadow-xl"
      aria-label="Panel de diseño y capas"
    >
      <div className="flex h-11 items-center gap-2 border-b border-border px-3">
        <Layers3 className="size-4 text-primary" />
        <strong className="text-sm">Diseño y capas</strong>
        <button
          className="ml-auto rounded-md p-1 hover:bg-accent"
          onClick={onClose}
          aria-label="Cerrar modo diseño"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="space-y-2 border-b border-border p-3">
        <p className="text-[11px] text-muted-foreground">
          Mayús + clic selecciona varios. También puedes arrastrar un marco sobre los objetos.
        </p>
        <p className="text-[11px] text-muted-foreground">
          La página original queda fija; los textos, imágenes y formas que añadas son editables.
        </p>
        <div className="grid grid-cols-4 gap-1">
          {alignActions.map(([mode, Icon, label]) => (
            <button
              key={mode}
              title={label}
              aria-label={label}
              disabled={editableSelected.length < 2}
              onClick={() => alignAnnotations(selectedAnnotationIds, mode)}
              className="inline-flex h-8 items-center justify-center rounded-md border border-input hover:bg-accent disabled:opacity-35"
            >
              <Icon className="size-3.5" />
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          <button
            disabled={selected.length < 2}
            onClick={() => groupAnnotations(selectedAnnotationIds)}
            className="flex h-8 flex-1 items-center justify-center gap-1 rounded-md border border-input text-xs hover:bg-accent disabled:opacity-35"
          >
            <Group className="size-3.5" /> Agrupar
          </button>
          <button
            disabled={!hasGroup}
            onClick={() => ungroupAnnotations(selectedAnnotationIds)}
            className="flex h-8 flex-1 items-center justify-center gap-1 rounded-md border border-input text-xs hover:bg-accent disabled:opacity-35"
          >
            <Ungroup className="size-3.5" /> Separar
          </button>
        </div>
      </div>

      <div className="flex items-center border-b border-border px-3 py-2 text-[11px] text-muted-foreground">
        <span>{layers.length} elementos</span>
        <button
          className="ml-auto hover:text-foreground"
          onClick={() => setSelectedAnnotations(layers.map((item) => item.id))}
        >
          Seleccionar todos
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
        {layers.length === 0 && (
          <p className="p-4 text-center text-xs text-muted-foreground">
            Añade texto, formas o imágenes para crear capas.
          </p>
        )}
        {layers.map((item) => {
          const active = selectedAnnotationIds.includes(item.id);
          return (
            <div
              key={item.id}
              className={`flex items-center gap-1 rounded-lg border px-1.5 py-1.5 ${active ? "border-primary bg-primary/10" : "border-transparent hover:bg-accent/60"}`}
              onClick={(event) =>
                toggleAnnotationSelection(item.id, event.shiftKey || event.metaKey || event.ctrlKey)
              }
            >
              <button
                className="rounded p-1 hover:bg-background"
                title={item.hidden ? "Mostrar" : "Ocultar"}
                onClick={(event) => {
                  event.stopPropagation();
                  updateAnnotation(item.id, { hidden: !item.hidden });
                }}
              >
                {item.hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              </button>
              <button
                className="rounded p-1 hover:bg-background"
                title={item.locked ? "Desbloquear" : "Bloquear"}
                onClick={(event) => {
                  event.stopPropagation();
                  updateAnnotation(item.id, { locked: !item.locked });
                }}
              >
                {item.locked ? <Lock className="size-3.5" /> : <Unlock className="size-3.5" />}
              </button>
              <input
                value={item.name ?? TOOL_LABELS[item.kind]}
                aria-label="Nombre de la capa"
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => updateAnnotation(item.id, { name: event.target.value })}
                className="h-7 min-w-0 flex-1 bg-transparent px-1 text-xs outline-none focus:rounded focus:bg-background"
              />
              <button
                title="Subir capa"
                className="rounded p-1 hover:bg-background"
                onClick={(event) => {
                  event.stopPropagation();
                  reorderAnnotation(item.id, "forward");
                }}
              >
                <ArrowUp className="size-3.5" />
              </button>
              <button
                title="Bajar capa"
                className="rounded p-1 hover:bg-background"
                onClick={(event) => {
                  event.stopPropagation();
                  reorderAnnotation(item.id, "backward");
                }}
              >
                <ArrowDown className="size-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      <div className="flex gap-1 border-t border-border p-2">
        <button
          disabled={!editableSelected.length}
          onClick={() =>
            updateAnnotations(
              editableSelected.map((item) => item.id),
              { locked: true },
            )
          }
          className="flex h-8 flex-1 items-center justify-center gap-1 rounded-md border border-input text-xs hover:bg-accent disabled:opacity-35"
        >
          <Lock className="size-3.5" /> Bloquear
        </button>
        <button
          disabled={!editableSelected.length}
          onClick={() => deleteAnnotations(editableSelected.map((item) => item.id))}
          className="flex h-8 flex-1 items-center justify-center gap-1 rounded-md border border-destructive/30 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-35"
        >
          <Trash2 className="size-3.5" /> Eliminar
        </button>
      </div>
    </aside>
  );
}
