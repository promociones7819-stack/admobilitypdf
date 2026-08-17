import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { usePdfEditor } from "@/lib/pdf/store";
import {
  createAnnotation,
  imageDataUrl,
  MARKER_KINDS,
  type Annotation,
  type AnnotationKind,
  type Point,
} from "@/lib/pdf/annotations";

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

export function AnnotationLayer({ pageId, width, height, scale, heightPt, onRequestImage }: Props) {
  const {
    annotations,
    images,
    tool,
    style,
    setTool,
    selectedAnnotationId,
    setSelectedAnnotation,
    addAnnotation,
    updateAnnotation,
    deleteAnnotation,
  } = usePdfEditor();
  const layerRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);
  const pageAnnotations = annotations.filter((a) => a.pageId === pageId);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;
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

  function beginCreate(event: React.PointerEvent) {
    if (tool === "select") {
      setSelectedAnnotation(null);
      return;
    }
    const at = toLocal(event);
    if (tool === "text") {
      const annotation = createAnnotation(
        "text",
        pageId,
        { x: at.x, y: at.y, width: 0.35, height: (style.fontSize * 1.4) / heightPt },
        style,
        { text: "" },
      );
      addAnnotation(annotation);
      setEditing({ id: annotation.id, value: "" });
      setTool("select");
      return;
    }
    if (tool === "image") {
      onRequestImage({ x: at.x, y: at.y, width: 0.3, height: 0.15 });
      setTool("select");
      return;
    }
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
    setDraft({ mode: "create", kind: tool, start: at, current: at, points: [at] });
  }

  function onPointerMove(event: React.PointerEvent) {
    if (!draft) return;
    const at = toLocal(event);
    if (draft.mode === "create") {
      setDraft({ ...draft, current: at, points: [...draft.points, at] });
      return;
    }
    const dx = at.x - draft.start.x;
    const dy = at.y - draft.start.y;
    if (draft.mode === "move") {
      setDraft({ ...draft, start: draft.start });
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
      if (kind === "ink") {
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
            createAnnotation(
              "ink",
              pageId,
              { x: box.minX, y: box.minY, width: w, height: h },
              style,
              {
                points: draft.points.map((p) => ({
                  x: (p.x - box.minX) / w,
                  y: (p.y - box.minY) / h,
                })),
              },
            ),
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
      setTool("select");
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
    const box: React.CSSProperties = {
      position: "absolute",
      left: `${merged.x * 100}%`,
      top: `${merged.y * 100}%`,
      width: `${merged.width * 100}%`,
      height: `${merged.height * 100}%`,
      opacity: merged.opacity,
    };

    const content = (() => {
      switch (merged.kind) {
        case "highlight":
          return <div className="size-full" style={{ backgroundColor: merged.color }} />;
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
                  backgroundColor: merged.color,
                }}
              />
            </div>
          );
        case "ink":
          return (
            <svg className="size-full overflow-visible" viewBox="0 0 1 1" preserveAspectRatio="none">
              <polyline
                points={(merged.points ?? []).map((p) => `${p.x},${p.y}`).join(" ")}
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
          if (editing?.id === merged.id) {
            return (
              <textarea
                autoFocus
                value={editing.value}
                onChange={(e) => setEditing({ id: merged.id, value: e.target.value })}
                onBlur={() => {
                  if (!editing.value.trim()) deleteAnnotation(merged.id);
                  else updateAnnotation(merged.id, { text: editing.value });
                  setEditing(null);
                }}
                className="size-full resize-none rounded-sm border border-primary bg-background/80 p-0 leading-tight outline-none"
                style={{
                  fontFamily: "Helvetica, Arial, sans-serif",
                  fontSize: `${px(merged.fontSize ?? 16)}px`,
                  color: merged.color,
                }}
              />
            );
          }
          return (
            <div
              className="size-full whitespace-pre-wrap leading-tight"
              style={{
                fontFamily: "Helvetica, Arial, sans-serif",
                fontSize: `${px(merged.fontSize ?? 16)}px`,
                color: merged.color,
              }}
            >
              {merged.text}
            </div>
          );
        }
        default:
          return null;
      }
    })();

    return (
      <div
        key={annotation.id}
        style={box}
        className={selected ? "outline outline-1 outline-primary" : undefined}
        onPointerDown={(event) => {
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
          if (annotation.kind !== "text") return;
          event.stopPropagation();
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
  const draftBox = drafting && drafting.kind !== "ink" ? normalizedBox(drafting.start, drafting.current) : null;

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
      }}
      onPointerDown={beginCreate}
      onPointerMove={onPointerMove}
      onPointerUp={endDraft}
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
      {drafting && drafting.kind === "ink" && (
        <svg className="pointer-events-none absolute inset-0 size-full" viewBox="0 0 1 1" preserveAspectRatio="none">
          <polyline
            points={drafting.points.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke={style.color}
            strokeWidth={Math.max(1, style.strokeWidth) * scale}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      )}
    </div>
  );
}
