import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { usePdfEditor } from "@/lib/pdf/store";
import {
  createAnnotation,
  imageDataUrl,
  MARKER_KINDS,
  STROKE_KINDS,
  type Annotation,
  type AnnotationKind,
  type Point,
} from "@/lib/pdf/annotations";
import { fontCss } from "@/lib/pdf/fonts";

interface Props {
  pageId: string;
  /** CSS size of the rendered page canvas. */
  width: number;
  height: number;
  /** CSS pixels per PDF point (zoom factor). */
  scale: number;
  /** Page size in PDF points, as displayed (rotation applied). */
  heightPt: number;
  onRequestImage: (placement: { x: number; y: number; width: number; height: number }) => void;
}

type Draft =
  | { mode: "create"; kind: AnnotationKind; start: Point; current: Point; points: Point[] }
  | { mode: "move"; id: string; origin: Annotation; start: Point }
  | { mode: "resize"; id: string; origin: Annotation; start: Point };

const MIN_SIZE = 0.004;

function normalizedBox(a: Point, b: Point) {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(Math.abs(b.x - a.x), MIN_SIZE),
    height: Math.max(Math.abs(b.y - a.y), MIN_SIZE),
  };
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

/** Pointer pressure normalized to a usable stroke multiplier. */
function pressureOf(event: React.PointerEvent, enabled: boolean) {
  if (!enabled) return 1;
  const raw = event.pressure;
  // Mouse/trackpad report 0.5 (or 0) — treat those as "no pressure info".
  if (!raw || raw === 0.5 || event.pointerType === "mouse") return 1;
  return 0.35 + raw * 0.95;
}

function strokePath(points: Point[]) {
  return points.map((p) => `${p.x},${p.y}`).join(" ");
}

export function AnnotationLayer({ pageId, width, height, scale, heightPt, onRequestImage }: Props) {
  const {
    annotations,
    images,
    tool,
    style,
    setTool,
    studyMode,
    toggleCover,
    selectedAnnotationId,
    setSelectedAnnotation,
    addAnnotation,
    updateAnnotation,
    deleteAnnotation,
  } = usePdfEditor();
  const layerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);
  const pageAnnotations = annotations.filter((a) => a.pageId === pageId);

  /**
   * Focus is applied in an effect (not inside render) so React has already
   * committed the textarea. On macOS the native mousedown default action moves
   * focus to <body> after render, which is why pointerdown is prevented at the
   * source instead of re-focusing here on every keystroke.
   */
  useEffect(() => {
    if (!editing) return;
    const node = textareaRef.current;
    if (!node) return;
    const id = requestAnimationFrame(() => {
      if (document.activeElement !== node) {
        node.focus({ preventScroll: true });
        const end = node.value.length;
        node.setSelectionRange(end, end);
      }
    });
    return () => cancelAnimationFrame(id);
  }, [editing?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable)
      )
        return;
      if ((event.key === "Delete" || event.key === "Backspace") && selectedAnnotationId) {
        event.preventDefault();
        deleteAnnotation(selectedAnnotationId);
      }
      if (event.key === "Escape") setSelectedAnnotation(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteAnnotation, selectedAnnotationId, setSelectedAnnotation]);

  function toLocal(event: React.PointerEvent | PointerEvent): Point {
    const rect = layerRef.current!.getBoundingClientRect();
    return {
      x: clamp01((event.clientX - rect.left) / rect.width),
      y: clamp01((event.clientY - rect.top) / rect.height),
    };
  }

  function commitEditing() {
    if (!editing) return;
    const value = editing.value;
    if (!value.trim()) deleteAnnotation(editing.id);
    else updateAnnotation(editing.id, { text: value });
    setEditing(null);
  }

  function beginCreate(event: React.PointerEvent) {
    if (editing) {
      commitEditing();
      if (tool === "select") return;
    }
    if (tool === "select") {
      setSelectedAnnotation(null);
      return;
    }
    const at = toLocal(event);
    if (tool === "text") {
      // Prevent the native focus shift so the textarea keeps focus on Mac.
      event.preventDefault();
      const annotation = createAnnotation(
        "text",
        pageId,
        { x: at.x, y: at.y, width: 0.35, height: (style.fontSize * 1.6) / heightPt },
        style,
        { text: "" },
      );
      addAnnotation(annotation);
      setSelectedAnnotation(annotation.id);
      setEditing({ id: annotation.id, value: "" });
      setTool("select");
      return;
    }
    if (tool === "image") {
      onRequestImage({ x: at.x, y: at.y, width: 0.3, height: 0.15 });
      setTool("select");
      return;
    }
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    const first = { ...at, p: pressureOf(event, style.pressure) };
    setDraft({ mode: "create", kind: tool, start: first, current: first, points: [first] });
  }

  function onPointerMove(event: React.PointerEvent) {
    if (!draft) return;
    const at = { ...toLocal(event), p: pressureOf(event, style.pressure) };
    if (draft.mode === "create") {
      setDraft({ ...draft, current: at, points: [...draft.points, at] });
      return;
    }
    const dx = at.x - draft.start.x;
    const dy = at.y - draft.start.y;
    if (draft.mode === "move") {
      updateAnnotationPreview(draft.origin, {
        x: clamp01(draft.origin.x + dx),
        y: clamp01(draft.origin.y + dy),
      });
    } else {
      updateAnnotationPreview(draft.origin, {
        width: Math.max(MIN_SIZE, draft.origin.width + dx),
        height: Math.max(MIN_SIZE, draft.origin.height + dy),
      });
    }
  }

  const [preview, setPreview] = useState<Partial<Annotation> & { id?: string }>({});
  function updateAnnotationPreview(origin: Annotation, patch: Partial<Annotation>) {
    setPreview({ id: origin.id, ...patch });
  }

  function endDraft() {
    if (!draft) return;
    if (draft.mode === "create") {
      const kind = draft.kind;
      if (STROKE_KINDS.includes(kind)) {
        const box = draft.points.reduce(
          (acc, p) => ({
            minX: Math.min(acc.minX, p.x),
            minY: Math.min(acc.minY, p.y),
            maxX: Math.max(acc.maxX, p.x),
            maxY: Math.max(acc.maxY, p.y),
          }),
          { minX: 1, minY: 1, maxX: 0, maxY: 0 },
        );
        const w = Math.max(box.maxX - box.minX, MIN_SIZE);
        const h = Math.max(box.maxY - box.minY, MIN_SIZE);
        if (draft.points.length > 1) {
          addAnnotation(
            createAnnotation(kind, pageId, { x: box.minX, y: box.minY, width: w, height: h }, style, {
              points: draft.points.map((p) => ({
                x: (p.x - box.minX) / w,
                y: (p.y - box.minY) / h,
                p: p.p,
              })),
            }),
          );
        }
      } else {
        const box = normalizedBox(draft.start, draft.current);
        const geometry = MARKER_KINDS.includes(kind)
          ? { ...box, height: Math.max(box.height, (style.fontSize * 1.1) / heightPt) }
          : box;
        if (box.width > MIN_SIZE * 2 || box.height > MIN_SIZE * 2)
          addAnnotation(createAnnotation(kind, pageId, geometry, style));
      }
      // The strip and the pen stay active so several marks can be made in a row.
      if (kind !== "studyCover" && !STROKE_KINDS.includes(kind)) setTool("select");
    } else if (preview.id) {
      const { id, ...patch } = preview;
      updateAnnotation(id, patch);
    }
    setPreview({});
    setDraft(null);
  }

  function renderAnnotation(annotation: Annotation) {
    const merged =
      preview.id === annotation.id ? ({ ...annotation, ...preview } as Annotation) : annotation;
    const selected = selectedAnnotationId === annotation.id && tool === "select";
    const px = (value: number) => value * scale;
    const isEditing = editing?.id === merged.id;
    const box: React.CSSProperties = {
      position: "absolute",
      left: `${merged.x * 100}%`,
      top: `${merged.y * 100}%`,
      width: `${merged.width * 100}%`,
      height: `${merged.height * 100}%`,
      opacity: merged.kind === "studyCover" && merged.revealed ? 0.18 : merged.opacity,
    };

    const content = (() => {
      switch (merged.kind) {
        case "studyCover":
          return (
            <div
              className="size-full rounded-[3px] transition-opacity"
              style={{
                backgroundColor: merged.revealed ? "transparent" : merged.color,
                border: merged.revealed ? `1px dashed ${merged.color}` : "none",
              }}
            />
          );
        case "highlight":
          if ((merged.points ?? []).length > 1)
            return (
              <svg
                className="size-full overflow-visible"
                viewBox="0 0 1 1"
                preserveAspectRatio="none"
                style={{ mixBlendMode: "multiply" }}
              >
                <polyline
                  points={strokePath(merged.points ?? [])}
                  fill="none"
                  stroke={merged.color}
                  strokeWidth={Math.max(1, merged.strokeWidth) * scale}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            );
          return (
            <div
              className="size-full rounded-[2px]"
              style={{ backgroundColor: merged.color, mixBlendMode: "multiply" }}
            />
          );
        case "rect":
          return (
            <div
              className="size-full"
              style={{
                border: `${px(Math.max(1, merged.strokeWidth))}px solid ${merged.color}`,
                backgroundColor: merged.filled ? merged.color : "transparent",
              }}
            />
          );
        case "ellipse":
          return (
            <div
              className="size-full rounded-[50%]"
              style={{
                border: `${px(Math.max(1, merged.strokeWidth))}px solid ${merged.color}`,
                backgroundColor: merged.filled ? merged.color : "transparent",
              }}
            />
          );
        case "underline":
        case "strike":
          return (
            <div className="relative size-full">
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: merged.kind === "underline" ? "100%" : "50%",
                  height: `${px(Math.max(1, merged.strokeWidth))}px`,
                  borderRadius: 999,
                  backgroundColor: merged.color,
                }}
              />
            </div>
          );
        case "ink":
          return (
            <svg className="size-full overflow-visible" viewBox="0 0 1 1" preserveAspectRatio="none">
              <polyline
                points={strokePath(merged.points ?? [])}
                fill="none"
                stroke={merged.color}
                strokeWidth={Math.max(1, merged.strokeWidth) * scale}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          );
        case "image": {
          const asset = merged.imageId ? images[merged.imageId] : undefined;
          return asset ? (
            <img
              src={imageDataUrl(asset)}
              alt="Anotación de imagen"
              className="size-full object-fill"
              draggable={false}
            />
          ) : null;
        }
        case "text": {
          const textStyle: React.CSSProperties = {
            fontFamily: fontCss(merged.fontFamily),
            fontSize: `${px(merged.fontSize ?? 16)}px`,
            lineHeight: 1.25,
            color: merged.color,
            fontWeight: merged.bold ? 700 : 400,
            fontStyle: merged.italic ? "italic" : "normal",
            textDecoration: merged.underline ? "underline" : "none",
            textAlign: (merged.align ?? "left") as React.CSSProperties["textAlign"],
          };
          if (isEditing) {
            return (
              <textarea
                ref={textareaRef}
                value={editing!.value}
                onChange={(e) => setEditing({ id: merged.id, value: e.target.value })}
                onPointerDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  // Keep native Cmd/Ctrl shortcuts (A/C/V/X/Z) inside the field.
                  e.stopPropagation();
                  if (e.key === "Escape") {
                    e.preventDefault();
                    commitEditing();
                  }
                }}
                onBlur={commitEditing}
                className="size-full resize-none rounded-sm border border-primary bg-background/70 p-0 outline-none"
                style={textStyle}
              />
            );
          }
          return (
            <div className="size-full whitespace-pre-wrap break-words" style={textStyle}>
              {merged.text}
            </div>
          );
        }

        default:
          return null;
      }
    })();

    const isCover = merged.kind === "studyCover";
    return (
      <div
        key={annotation.id}
        style={{ ...box, touchAction: "none" }}
        className={selected ? "outline outline-1 outline-primary" : undefined}
        onPointerDown={(event) => {
          if (isEditing) return;
          if (isCover) {
            // Study interaction first: a tap reveals/hides; move only when selected.
            event.stopPropagation();
            if (selected) {
              setDraft({
                mode: "move",
                id: annotation.id,
                origin: annotation,
                start: toLocal(event),
              });
              return;
            }
            event.preventDefault();
            toggleCover(annotation.id);
            return;
          }
          if (tool !== "select") return;
          event.stopPropagation();
          setSelectedAnnotation(annotation.id);
          setDraft({
            mode: "move",
            id: annotation.id,
            origin: annotation,
            start: toLocal(event),
          });
        }}
        onDoubleClick={(event) => {
          event.stopPropagation();
          if (isCover) {
            setSelectedAnnotation(annotation.id);
            return;
          }
          if (annotation.kind !== "text") return;
          setSelectedAnnotation(annotation.id);
          setEditing({ id: annotation.id, value: annotation.text ?? "" });
        }}
      >
        {content}
        {selected && (
          <>
            <button
              className="absolute -right-3 -top-3 inline-flex size-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => deleteAnnotation(annotation.id)}
              aria-label="Eliminar anotación"
            >
              <Trash2 className="size-3" />
            </button>
            {annotation.kind !== "ink" && (
              <div
                className="absolute -bottom-1.5 -right-1.5 size-3 cursor-nwse-resize rounded-sm border border-primary bg-background"
                onPointerDown={(event) => {
                  event.stopPropagation();
                  setDraft({
                    mode: "resize",
                    id: annotation.id,
                    origin: annotation,
                    start: toLocal(event),
                  });
                }}
              />
            )}
          </>
        )}
      </div>
    );
  }

  const drafting = draft?.mode === "create" ? draft : null;
  const draftStroke = drafting && STROKE_KINDS.includes(drafting.kind) ? drafting : null;
  const draftBox = drafting && !draftStroke ? normalizedBox(drafting.start, drafting.current) : null;

  return (
    <div
      ref={layerRef}
      data-testid="annotation-layer"
      className="absolute inset-0"
      style={{
        width,
        height,
        cursor: tool === "select" ? "default" : "crosshair",
        pointerEvents: "auto",
        // Stops the browser from turning a pen/finger drawing gesture into a scroll.
        touchAction: tool === "select" && !studyMode ? "auto" : "none",
      }}
      onPointerDown={beginCreate}
      onPointerMove={onPointerMove}
      onPointerUp={endDraft}
      onPointerCancel={() => draft && endDraft()}
      onPointerLeave={() => draft && endDraft()}
    >
      {pageAnnotations.map(renderAnnotation)}
      {draftBox && (
        <div
          className="absolute border border-primary/70 bg-primary/10"
          style={{
            left: `${draftBox.x * 100}%`,
            top: `${draftBox.y * 100}%`,
            width: `${draftBox.width * 100}%`,
            height: `${draftBox.height * 100}%`,
          }}
        />
      )}
      {draftStroke && (
        <svg
          className="pointer-events-none absolute inset-0 size-full"
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
          style={
            draftStroke.kind === "highlight"
              ? { mixBlendMode: "multiply", opacity: Math.min(style.opacity, 0.45) }
              : undefined
          }
        >
          <polyline
            points={strokePath(draftStroke.points)}
            fill="none"
            stroke={
              draftStroke.kind === "highlight"
                ? style.color === "#e11d48"
                  ? "#facc15"
                  : style.color
                : style.color
            }
            strokeWidth={
              Math.max(
                1,
                draftStroke.kind === "highlight" ? style.highlightWidth : style.strokeWidth,
              ) * scale
            }
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      )}
    </div>
  );
}
