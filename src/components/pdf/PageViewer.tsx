import { useEffect, useRef, useState } from "react";
import { FileText } from "lucide-react";
import { usePdfEditor } from "@/lib/pdf/store";
import { getPageSize, renderPageToCanvas } from "@/lib/pdf/render";
import type { ZoomMode } from "./zoom";

interface Props {
  zoom: ZoomMode;
  onEffectiveScale: (scale: number) => void;
}

export function PageViewer({ zoom, onEffectiveScale }: Props) {
  const { pages, activePageId, sources } = usePdfEditor();
  const page = pages.find((p) => p.id === activePageId) ?? pages[0];
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tokenRef = useRef(0);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [rendering, setRendering] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setContainerSize({ width: el.clientWidth, height: el.clientHeight });
    });
    observer.observe(el);
    setContainerSize({ width: el.clientWidth, height: el.clientHeight });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const source = page ? sources[page.sourceId] : undefined;
    if (!canvas || !page || !source || containerSize.width === 0) return;
    const token = ++tokenRef.current;
    let cancelled = false;
    setRendering(true);

    (async () => {
      try {
        const base = await getPageSize(source.doc, page.sourceIndex, page.rotation);
        const padding = 48;
        let scale: number;
        if (typeof zoom === "number") {
          scale = zoom;
        } else if (zoom === "fit-width") {
          scale = (containerSize.width - padding) / base.width;
        } else {
          scale = Math.min(
            (containerSize.width - padding) / base.width,
            (containerSize.height - padding) / base.height,
          );
        }
        scale = Math.max(0.1, Math.min(scale, 6));
        if (cancelled || token !== tokenRef.current) return;
        onEffectiveScale(scale);
        await renderPageToCanvas(source.doc, page.sourceIndex, canvas, {
          scale,
          extraRotation: page.rotation,
        });
      } catch {
        /* render cancelled or page unavailable */
      } finally {
        if (!cancelled) setRendering(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page?.id, page?.rotation, page?.sourceId, page?.sourceIndex, sources, zoom, containerSize.width, containerSize.height]);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-auto bg-canvas p-6"
      data-testid="page-viewer"
    >
      {page ? (
        <div className="flex min-h-full w-full items-start justify-center">
          <div className="page-shadow inline-block rounded-sm bg-white">
            <canvas ref={canvasRef} className="block rounded-sm" />
          </div>
        </div>
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
          <FileText className="size-8" />
          <p className="text-sm">No hay páginas en el documento.</p>
        </div>
      )}
      {rendering && (
        <div className="pointer-events-none absolute right-4 top-4 rounded-full bg-foreground/80 px-3 py-1 text-xs text-background">
          Renderizando…
        </div>
      )}
    </div>
  );
}
