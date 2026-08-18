import { useState } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Check,
  ChevronDown,
  Eraser,
  Eye,
  EyeOff,
  GraduationCap,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { usePdfEditor } from "@/lib/pdf/store";
import {
  FONT_SIZE_PRESETS,
  HIGHLIGHT_PRESETS,
  MAX_STROKE,
  MIN_STROKE,
  PALETTE,
  TOOL_LABELS,
  type TextAlign,
} from "@/lib/pdf/annotations";
import { FONT_CATALOG, fontCss } from "@/lib/pdf/fonts";

function FontPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (family: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-input bg-background px-2 text-xs"
          aria-label="Fuente"
        >
          <span className="max-w-32 truncate" style={{ fontFamily: fontCss(value) }}>
            {value}
          </span>
          <ChevronDown className="size-3 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="max-h-80 w-64 overflow-y-auto p-1">
        {FONT_CATALOG.map((font) => (
          <button
            key={font.family}
            onClick={() => {
              onChange(font.family);
              setOpen(false);
            }}
            className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left hover:bg-accent"
          >
            <span className="min-w-0">
              <span className="block text-[11px] text-muted-foreground">{font.label}</span>
              <span
                className="block truncate text-base leading-tight"
                style={{ fontFamily: fontCss(font.family) }}
              >
                Texto de ejemplo
              </span>
            </span>
            {font.family === value && <Check className="size-4 shrink-0 text-primary" />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

/** Contextual property bar for the active tool / selected annotation. */
export function AnnotationOptions() {
  const {
    tool,
    style,
    setStyle,
    annotations,
    selectedAnnotationId,
    setSelectedAnnotation,
    updateAnnotation,
    activePageId,
    clearPageAnnotations,
    setCoversRevealed,
    toggleCover,
    studyMode,
    setStudyMode,
  } = usePdfEditor();
  const [studyIndex, setStudyIndex] = useState(0);
  const selected = annotations.find((a) => a.id === selectedAnnotationId) ?? null;
  const pageAnnotations = annotations.filter((a) => a.pageId === activePageId);
  const pageCount = pageAnnotations.length;
  const covers = pageAnnotations.filter((a) => a.kind === "studyCover");
  const kind = selected?.kind ?? tool;
  const showText = kind === "text";
  const isHighlight = kind === "highlight";
  const showStroke = ["ink", "rect", "ellipse", "underline", "strike", "highlight"].includes(kind);
  const strokeValue = isHighlight
    ? (selected?.strokeWidth ?? style.highlightWidth)
    : (selected?.strokeWidth ?? style.strokeWidth);
  const currentCover = covers[Math.min(studyIndex, Math.max(0, covers.length - 1))];

  function applyColor(color: string) {
    setStyle({ color });
    if (selected) updateAnnotation(selected.id, { color });
  }

  function applyStroke(next: number) {
    const strokeWidth = Math.max(MIN_STROKE, Math.min(MAX_STROKE, next));
    setStyle(isHighlight ? { highlightWidth: strokeWidth } : { strokeWidth });
    if (selected) updateAnnotation(selected.id, { strokeWidth });
  }

  return (
    <div className="flex h-11 shrink-0 items-center gap-3 overflow-x-auto border-b border-border bg-card px-3 text-xs">
      <span className="shrink-0 font-medium text-muted-foreground">
        {TOOL_LABELS[kind] ?? TOOL_LABELS[tool]}
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
            min={MIN_STROKE}
            max={isHighlight ? MAX_STROKE : 24}
            step={1}
            value={strokeValue}
            onChange={(e) => applyStroke(Number(e.target.value))}
            className="w-28 accent-primary"
            aria-label="Grosor del trazo"
          />
          <input
            type="number"
            min={MIN_STROKE}
            max={MAX_STROKE}
            value={strokeValue}
            onChange={(e) => applyStroke(Number(e.target.value) || 1)}
            className="h-7 w-14 rounded-md border border-input bg-background px-2"
          />
        </label>
      )}

      {isHighlight && (
        <div className="flex shrink-0 items-center gap-1">
          {HIGHLIGHT_PRESETS.map((preset) => (
            <button
              key={preset.value}
              onClick={() => applyStroke(preset.value)}
              className={`rounded-md border px-2 py-1 transition-colors ${
                strokeValue === preset.value
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-input text-muted-foreground hover:bg-accent"
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      )}

      {showText && (
        <>
          <FontPicker
            value={selected?.fontFamily ?? style.fontFamily}
            onChange={(fontFamily) => {
              setStyle({ fontFamily });
              if (selected) updateAnnotation(selected.id, { fontFamily });
            }}
          />
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
            <select
              value=""
              onChange={(e) => {
                const fontSize = Number(e.target.value);
                if (!fontSize) return;
                setStyle({ fontSize });
                if (selected) updateAnnotation(selected.id, { fontSize });
              }}
              aria-label="Tamaños predefinidos"
              className="h-7 rounded-md border border-input bg-background px-1"
            >
              <option value="">pt</option>
              {FONT_SIZE_PRESETS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
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
          <div className="flex shrink-0 items-center gap-1">
            {(
              [
                { key: "left", icon: AlignLeft, aria: "Alinear a la izquierda" },
                { key: "center", icon: AlignCenter, aria: "Centrar" },
                { key: "right", icon: AlignRight, aria: "Alinear a la derecha" },
              ] as const
            ).map((option) => {
              const current = (selected?.align ?? style.align) as TextAlign;
              const active = current === option.key;
              const Icon = option.icon;
              return (
                <button
                  key={option.key}
                  aria-label={option.aria}
                  aria-pressed={active}
                  onClick={() => {
                    setStyle({ align: option.key });
                    if (selected) updateAnnotation(selected.id, { align: option.key });
                  }}
                  className={`inline-flex size-7 items-center justify-center rounded-md border transition-colors ${
                    active
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-input text-muted-foreground hover:bg-accent"
                  }`}
                >
                  <Icon className="size-3.5" />
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

      {["rect", "ellipse"].includes(kind) && (
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

      {(kind === "studyCover" || covers.length > 0) && (
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            onClick={() => setCoversRevealed(true, activePageId)}
            className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-muted-foreground hover:bg-accent"
          >
            <Eye className="size-3.5" /> Mostrar todas
          </button>
          <button
            onClick={() => setCoversRevealed(false, activePageId)}
            className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-muted-foreground hover:bg-accent"
          >
            <EyeOff className="size-3.5" /> Ocultar todas
          </button>
          <button
            aria-pressed={studyMode}
            onClick={() => {
              const next = !studyMode;
              setStudyMode(next);
              if (next) {
                setCoversRevealed(false, activePageId);
                setStudyIndex(0);
              }
            }}
            className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 transition-colors ${
              studyMode
                ? "border-primary bg-primary/10 text-foreground"
                : "border-input text-muted-foreground hover:bg-accent"
            }`}
          >
            <GraduationCap className="size-3.5" /> Modo estudio
          </button>
        </div>
      )}

      {studyMode && covers.length > 0 && (
        <div className="flex shrink-0 items-center gap-1.5 rounded-md bg-accent/60 px-2 py-1">
          <span className="text-muted-foreground">
            Tira {Math.min(studyIndex + 1, covers.length)} de {covers.length}
          </span>
          <button
            onClick={() => setStudyIndex((i) => Math.max(0, i - 1))}
            className="rounded px-1.5 py-0.5 hover:bg-background"
          >
            Anterior
          </button>
          <button
            onClick={() => setStudyIndex((i) => Math.min(covers.length - 1, i + 1))}
            className="rounded px-1.5 py-0.5 hover:bg-background"
          >
            Siguiente
          </button>
          <button
            onClick={() => {
              if (!currentCover) return;
              setSelectedAnnotation(null);
              toggleCover(currentCover.id);
            }}
            className="rounded px-1.5 py-0.5 hover:bg-background"
          >
            {currentCover?.revealed ? "Ocultar" : "Mostrar"}
          </button>
        </div>
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
