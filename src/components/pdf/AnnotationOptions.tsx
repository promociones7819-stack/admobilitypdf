import { Eraser } from "lucide-react";
import { usePdfEditor } from "@/lib/pdf/store";
import { PALETTE, TOOL_LABELS } from "@/lib/pdf/annotations";

/** Contextual property bar for the active tool / selected annotation. */
export function AnnotationOptions() {
  const {
    tool,
    style,
    setStyle,
    annotations,
    selectedAnnotationId,
    updateAnnotation,
    activePageId,
    clearPageAnnotations,
  } = usePdfEditor();
  const selected = annotations.find((a) => a.id === selectedAnnotationId) ?? null;
  const pageCount = annotations.filter((a) => a.pageId === activePageId).length;
  const showText = tool === "text" || selected?.kind === "text";
  const showStroke =
    selected?.kind !== "highlight" &&
    ["ink", "rect", "ellipse", "underline", "strike"].includes(selected?.kind ?? tool);

  function applyColor(color: string) {
    setStyle({ color });
    if (selected) updateAnnotation(selected.id, { color });
  }

  return (
    <div className="flex h-11 shrink-0 items-center gap-3 overflow-x-auto border-b border-border bg-card px-3 text-xs">
      <span className="shrink-0 font-medium text-muted-foreground">
        {selected ? TOOL_LABELS[selected.kind] : TOOL_LABELS[tool]}
      </span>

      <div className="flex shrink-0 items-center gap-1">
        {PALETTE.map((color) => {
          const active = (selected?.color ?? style.color).toLowerCase() === color;
          return (
            <button
              key={color}
              aria-label={`Color ${color}`}
              onClick={() => applyColor(color)}
              className={`size-5 rounded-full border transition-transform ${
                active ? "scale-110 border-foreground" : "border-border"
              }`}
              style={{ backgroundColor: color }}
            />
          );
        })}
      </div>

      {showStroke && (
        <label className="flex shrink-0 items-center gap-2 text-muted-foreground">
          Grosor
          <input
            type="range"
            min={1}
            max={12}
            step={1}
            value={selected?.strokeWidth ?? style.strokeWidth}
            onChange={(e) => {
              const strokeWidth = Number(e.target.value);
              setStyle({ strokeWidth });
              if (selected) updateAnnotation(selected.id, { strokeWidth });
            }}
            className="w-24 accent-primary"
          />
        </label>
      )}

      {showText && (
        <>
          <label className="flex shrink-0 items-center gap-2 text-muted-foreground">
            Tamaño
            <input
              type="number"
              min={6}
              max={96}
              value={selected?.fontSize ?? style.fontSize}
              onChange={(e) => {
                const fontSize = Math.max(6, Math.min(96, Number(e.target.value) || 16));
                setStyle({ fontSize });
                if (selected) updateAnnotation(selected.id, { fontSize });
              }}
              className="h-7 w-16 rounded-md border border-input bg-background px-2"
            />
          </label>
          <div className="flex shrink-0 items-center gap-1">
            {(
              [
                { key: "bold", label: "B", aria: "Negrita", className: "font-bold" },
                { key: "italic", label: "I", aria: "Cursiva", className: "italic" },
                { key: "underline", label: "U", aria: "Subrayado", className: "underline" },
              ] as const
            ).map((option) => {
              const active = selected ? !!selected[option.key] : style[option.key];
              return (
                <button
                  key={option.key}
                  aria-label={option.aria}
                  aria-pressed={active}
                  title={option.aria}
                  onClick={() => {
                    const next = !active;
                    setStyle({ [option.key]: next });
                    if (selected) updateAnnotation(selected.id, { [option.key]: next });
                  }}
                  className={`size-7 rounded-md border text-[13px] transition-colors ${option.className} ${
                    active
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-input text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </>
      )}


      <label className="flex shrink-0 items-center gap-2 text-muted-foreground">
        Opacidad
        <input
          type="range"
          min={10}
          max={100}
          step={5}
          value={Math.round((selected?.opacity ?? style.opacity) * 100)}
          onChange={(e) => {
            const opacity = Number(e.target.value) / 100;
            setStyle({ opacity });
            if (selected) updateAnnotation(selected.id, { opacity });
          }}
          className="w-24 accent-primary"
        />
      </label>

      {["rect", "ellipse"].includes(selected?.kind ?? tool) && (
        <label className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
          <input
            type="checkbox"
            checked={selected?.filled ?? style.filled}
            onChange={(e) => {
              const filled = e.target.checked;
              setStyle({ filled });
              if (selected) updateAnnotation(selected.id, { filled });
            }}
            className="size-3.5 accent-primary"
          />
          Relleno
        </label>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-3">
        <span className="text-muted-foreground">{pageCount} anotaciones en la página</span>
        <button
          disabled={!activePageId || pageCount === 0}
          onClick={() => activePageId && clearPageAnnotations(activePageId)}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
        >
          <Eraser className="size-3.5" /> Limpiar página
        </button>
      </div>
    </div>
  );
}
