import { useRef, useState } from "react";
import type { FlipbookPage } from "@/lib/flipbook/document";
import { actionLabel, buttonPresetGlyph, type Hotspot } from "@/lib/flipbook/hotspots";
import { cn } from "@/lib/utils";

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface EditorProps {
  page: FlipbookPage;
  hotspots: Hotspot[];
  menuPage: number;
  selectedId: string | null;
  adding: boolean;
  zoom: number;
  onSelect: (id: string | null) => void;
  onCreate: (rect: Rect) => void;
  onUpdate: (id: string, rect: Rect) => void;
}

type Drag =
  | { kind: "draw"; startX: number; startY: number }
  | { kind: "move"; id: string; base: Rect; startX: number; startY: number }
  | { kind: "resize"; id: string; base: Rect; startX: number; startY: number };

export function HotspotEditor({
  page,
  hotspots,
  menuPage,
  selectedId,
  adding,
  zoom,
  onSelect,
  onCreate,
  onUpdate,
}: EditorProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [draft, setDraft] = useState<Rect | null>(null);

  /** Convierte un punto de pantalla a puntos PDF de la página. */
  const toPoints = (clientX: number, clientY: number) => {
    const box = surfaceRef.current!.getBoundingClientRect();
    return {
      x: ((clientX - box.left) / box.width) * page.width,
      y: ((clientY - box.top) / box.height) * page.height,
    };
  };

  const clampRect = (rect: Rect): Rect => {
    const width = Math.max(8, Math.min(rect.width, page.width));
    const height = Math.max(8, Math.min(rect.height, page.height));
    return {
      width,
      height,
      x: Math.min(Math.max(0, rect.x), page.width - width),
      y: Math.min(Math.max(0, rect.y), page.height - height),
    };
  };

  const onPointerDown = (event: React.PointerEvent) => {
    if (!adding) return;
    if ((event.target as HTMLElement).dataset["hotspot"]) return;
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    const p = toPoints(event.clientX, event.clientY);
    setDrag({ kind: "draw", startX: p.x, startY: p.y });
    setDraft({ x: p.x, y: p.y, width: 0, height: 0 });
  };

  const startHotspotDrag = (
    event: React.PointerEvent,
    hotspot: Hotspot,
    kind: "move" | "resize",
  ) => {
    event.preventDefault();
    event.stopPropagation();
    onSelect(hotspot.id);
    const p = toPoints(event.clientX, event.clientY);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    setDrag({
      kind,
      id: hotspot.id,
      base: { x: hotspot.x, y: hotspot.y, width: hotspot.width, height: hotspot.height },
      startX: p.x,
      startY: p.y,
    });
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!drag) return;
    const p = toPoints(event.clientX, event.clientY);
    if (drag.kind === "draw") {
      setDraft({
        x: Math.min(drag.startX, p.x),
        y: Math.min(drag.startY, p.y),
        width: Math.abs(p.x - drag.startX),
        height: Math.abs(p.y - drag.startY),
      });
      return;
    }
    const dx = p.x - drag.startX;
    const dy = p.y - drag.startY;
    const next =
      drag.kind === "move"
        ? { ...drag.base, x: drag.base.x + dx, y: drag.base.y + dy }
        : { ...drag.base, width: drag.base.width + dx, height: drag.base.height + dy };
    onUpdate(drag.id, clampRect(next));
  };

  const onPointerUp = () => {
    if (drag?.kind === "draw" && draft) {
      if (draft.width > 6 && draft.height > 6) onCreate(clampRect(draft));
    }
    setDrag(null);
    setDraft(null);
  };

  const pct = (value: number, total: number) => `${(value / total) * 100}%`;

  return (
    <div className="flex flex-1 items-start justify-center overflow-auto p-4">
      <div
        className="relative bg-white shadow-xl"
        style={{ width: `${Math.round(680 * zoom)}px`, aspectRatio: `${page.width} / ${page.height}` }}
      >
        <img
          src={page.imageUrl}
          alt={`Página ${page.number}`}
          draggable={false}
          className="pointer-events-none absolute inset-0 size-full select-none object-contain"
        />
        <div
          ref={surfaceRef}
          className={cn("absolute inset-0", adding && "cursor-crosshair")}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          style={{ touchAction: adding || drag ? "none" : "auto" }}
        >
          {hotspots.map((hotspot) => {
            const active = hotspot.id === selectedId;
            return (
              <div
                key={hotspot.id}
                data-hotspot="1"
                role="button"
                tabIndex={0}
                aria-label={`Hotspot: ${actionLabel(hotspot, menuPage)}`}
                onPointerDown={(event) => startHotspotDrag(event, hotspot, "move")}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onKeyDown={(event) => {
                  const step = event.shiftKey ? 10 : 2;
                  const map: Record<string, [number, number]> = {
                    ArrowLeft: [-step, 0],
                    ArrowRight: [step, 0],
                    ArrowUp: [0, -step],
                    ArrowDown: [0, step],
                  };
                  const delta = map[event.key];
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(hotspot.id);
                    return;
                  }
                  if (!delta) return;
                  event.preventDefault();
                  onUpdate(
                    hotspot.id,
                    clampRect({
                      x: hotspot.x + delta[0],
                      y: hotspot.y + delta[1],
                      width: hotspot.width,
                      height: hotspot.height,
                    }),
                  );
                }}
                className={cn(
                  "absolute touch-none",
                  hotspot.buttonPreset
                    ? "flipbook-3d-button flex items-center justify-center border-0 text-white"
                    : "rounded-sm border-2 bg-primary/20",
                  hotspot.buttonPreset?.startsWith("arrow-") && "flipbook-3d-arrow",
                  hotspot.buttonPreset === "ad-mobility" && "flipbook-3d-brand",
                  hotspot.buttonPreset === "circle" && "rounded-full",
                  hotspot.buttonPreset === "square" && "rounded-xl",
                  active
                    ? "ring-2 ring-primary ring-offset-2"
                    : !hotspot.buttonPreset && "border-primary/60",
                )}
                style={{
                  left: pct(hotspot.x, page.width),
                  top: pct(hotspot.y, page.height),
                  width: pct(hotspot.width, page.width),
                  height: pct(hotspot.height, page.height),
                }}
              >
                {hotspot.buttonPreset === "ad-mobility" ? (
                  <img
                    src="/brand/ad-mobility.png"
                    alt="AD Mobility"
                    className="pointer-events-none size-full object-contain"
                  />
                ) : hotspot.buttonPreset ? (
                  <span className="pointer-events-none text-[clamp(16px,3vw,30px)] font-black leading-none drop-shadow-sm">
                    {buttonPresetGlyph(hotspot.buttonPreset)}
                  </span>
                ) : null}
                <span className="pointer-events-none absolute -top-5 left-0 whitespace-nowrap rounded bg-primary px-1 text-[10px] font-medium text-primary-foreground">
                  {actionLabel(hotspot, menuPage)}
                </span>
                <span
                  role="presentation"
                  onPointerDown={(event) => startHotspotDrag(event, hotspot, "resize")}
                  className="absolute -bottom-1.5 -right-1.5 size-3.5 cursor-se-resize rounded-sm border border-primary bg-background"
                />
              </div>
            );
          })}

          {draft && (
            <div
              className="pointer-events-none absolute rounded-sm border-2 border-dashed border-primary bg-primary/10"
              style={{
                left: pct(draft.x, page.width),
                top: pct(draft.y, page.height),
                width: pct(draft.width, page.width),
                height: pct(draft.height, page.height),
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
