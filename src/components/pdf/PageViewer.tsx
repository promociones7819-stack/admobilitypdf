import { useEffect, useRef, useState } from "react";
import { FileText } from "lucide-react";
import { toast } from "sonner";
import { usePdfEditor, friendlyError } from "@/lib/pdf/store";
import { getPageSize, renderPageToCanvas } from "@/lib/pdf/render";
import { createAnnotation, displaySize, readImageAsset } from "@/lib/pdf/annotations";
import { AnnotationLayer } from "./AnnotationLayer";
import { SignatureDialog } from "./SignatureDialog";
import type { ZoomMode } from "./zoom";

interface Props {
  zoom: ZoomMode;
  onEffectiveScale: (scale: number) => void;
}

export function PageViewer({ zoom, onEffectiveScale }: Props) {
  const { pages, activePageId, sources, style, addAnnotation, addImageAsset } = usePdfEditor();
  const page = pages.find((p) => p.id === activePageId) ?? pages[0];
  const source = page ? sources[page.sourceId] : undefined;
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const placementRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const tokenRef = useRef(0);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [rendering, setRendering] = useState(false);
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [signaturePlacement, setSignaturePlacement] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [layer, setLayer] = useState({ width: 0, height: 0, scale: 1, heightPt: 1 });

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
    if (!canvas || !page || containerSize.width === 0) return;
    if (!page.blank && !source) return;
    const token = ++tokenRef.current;
    let cancelled = false;
    setRendering(true);

    (async () => {
      try {
        const base = page.blank
          ? displaySize(page.blank.width, page.blank.height, page.rotation)
          : await getPageSize(source!.doc, page.sourceIndex, page.rotation);
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
        let result: { width: number; height: number };
        if (page.blank) {
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          const cssWidth = Math.floor(base.width * scale);
          const cssHeight = Math.floor(base.height * scale);
          canvas.width = Math.max(1, Math.floor(cssWidth * dpr));
          canvas.height = Math.max(1, Math.floor(cssHeight * dpr));
          canvas.style.width = `${cssWidth}px`;
          canvas.style.height = `${cssHeight}px`;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          }
          result = { width: cssWidth, height: cssHeight };
        } else {
          result = await renderPageToCanvas(source!.doc, page.sourceIndex, canvas, {
            scale,
            extraRotation: page.rotation,
          });
        }
        if (cancelled || token !== tokenRef.current) return;
        setLayer({
          width: Math.floor(result.width),
          height: Math.floor(result.height),
          scale,
          heightPt: base.height,
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
  }, [
    page?.id,
    page?.rotation,
    page?.sourceIndex,
    source?.doc,
    zoom,
    containerSize.width,
    containerSize.height,
  ]);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full flex-1 overflow-auto bg-canvas p-6"
      data-testid="page-viewer"
    >
      {page ? (
        <div className="flex min-h-full w-full items-start justify-center">
          <div className="page-shadow relative inline-block rounded-sm bg-white">
            <canvas ref={canvasRef} className="block rounded-sm" />
            {layer.width > 0 && (
              <AnnotationLayer
                pageId={page.id}
                width={layer.width}
                height={layer.height}
                scale={layer.scale}
                heightPt={layer.heightPt}
                onRequestImage={(placement) => {
                  placementRef.current = placement;
                  imageInputRef.current?.click();
                }}
                onRequestSignature={(placement) => {
                  setSignaturePlacement(placement);
                  setSignatureOpen(true);
                }}
              />
            )}
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
      <input
        ref={imageInputRef}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          const placement = placementRef.current;
          if (!file || !placement || !page) return;
          void readImageAsset(file)
            .then((asset) => {
              addImageAsset(asset);
              const ratio = asset.height / asset.width;
              const width = placement.width;
              const height = (width * layer.width * ratio) / Math.max(1, layer.height);
              addAnnotation(
                createAnnotation(
                  "image",
                  page.id,
                  {
                    x: Math.min(placement.x, 1 - width),
                    y: Math.min(placement.y, 1 - height),
                    width,
                    height,
                  },
                  style,
                  { imageId: asset.id, opacity: 1, lockAspect: true },
                ),
              );
            })
            .catch((error) => toast.error(friendlyError(error)));
        }}
      />
      <SignatureDialog
        open={signatureOpen}
        onOpenChange={setSignatureOpen}
        onConfirm={(asset) => {
          if (!page || !signaturePlacement) return;
          addImageAsset(asset);
          const ratio = asset.height / asset.width;
          const width = signaturePlacement.width;
          const height = (width * layer.width * ratio) / Math.max(1, layer.height);
          addAnnotation(
            createAnnotation(
              "signature",
              page.id,
              {
                x: Math.min(signaturePlacement.x, 1 - width),
                y: Math.min(signaturePlacement.y, 1 - height),
                width,
                height,
              },
              style,
              { imageId: asset.id, opacity: 1, lockAspect: true },
            ),
          );
        }}
      />
    </div>
  );
}
