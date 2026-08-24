/**
 * Carga de un PDF para el flipbook: páginas rasterizadas para el visor,
 * enlaces nativos del PDF y marcadores (índice). Todo local en el navegador.
 */
import { getPdfjs } from "@/lib/pdf/pdfjs";

/** Enlace nativo del PDF, en porcentajes de la página (0..100). */
export interface NativeLink {
  top: number;
  left: number;
  width: number;
  height: number;
  url?: string;
  targetPage?: number;
}

export interface FlipbookPage {
  number: number;
  /** Tamaño de la página en puntos PDF, tal y como se ve (con su rotación). */
  width: number;
  height: number;
  imageUrl: string;
  links: NativeLink[];
  text: string;
}

export interface OutlineEntry {
  title: string;
  page: number;
  depth: number;
}

export interface FlipbookDocument {
  pages: FlipbookPage[];
  outline: OutlineEntry[];
}

/** Releases the object URLs created while rasterizing a flipbook. */
export function disposeFlipbookDocument(doc: FlipbookDocument | null): void {
  if (!doc) return;
  for (const page of doc.pages) {
    if (page.imageUrl.startsWith("blob:")) URL.revokeObjectURL(page.imageUrl);
  }
}

const MAX_RENDER_WIDTH = 1400;

function renderWidthFor(pageCount: number) {
  if (pageCount > 120) return 900;
  if (pageCount > 60) return 1100;
  return MAX_RENDER_WIDTH;
}

export async function loadFlipbookDocument(
  file: File,
  onProgress?: (done: number, total: number) => void,
): Promise<FlipbookDocument> {
  const pdfjs = await getPdfjs();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data: bytes, stopAtErrors: false }).promise;
  const pages: FlipbookPage[] = [];

  try {
    const destCache = new Map<string, number>();
    const resolvePage = async (dest: unknown): Promise<number | undefined> => {
      try {
        let resolved = dest;
        if (typeof resolved === "string") {
          if (destCache.has(resolved)) return destCache.get(resolved);
          const key = resolved;
          resolved = await doc.getDestination(resolved);
          const page = await refToPage(resolved);
          if (page) destCache.set(key, page);
          return page;
        }
        return await refToPage(resolved);
      } catch {
        return undefined;
      }
    };
    const refToPage = async (dest: unknown): Promise<number | undefined> => {
      const first = Array.isArray(dest) ? dest[0] : null;
      if (!first) return undefined;
      if (typeof first === "number") return first + 1;
      const index = await doc.getPageIndex(first as never);
      return index + 1;
    };

    for (let n = 1; n <= doc.numPages; n += 1) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(2, renderWidthFor(doc.numPages) / base.width);
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas-2d-unavailable");
      await page.render({
        canvas,
        canvasContext: ctx,
        viewport,
      } as Parameters<typeof page.render>[0]).promise;

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((value) => resolve(value), "image/jpeg", 0.82),
      );
      const imageUrl = blob ? URL.createObjectURL(blob) : canvas.toDataURL("image/jpeg", 0.82);

      const links: NativeLink[] = [];
      const textContent = await page.getTextContent();
      const text = textContent.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      for (const annot of await page.getAnnotations()) {
        const a = annot as { subtype?: string; rect?: number[]; url?: string; dest?: unknown };
        if (a.subtype !== "Link" || !a.rect) continue;
        // El rect viene en el espacio del PDF (origen abajo-izquierda, sin rotar):
        // lo convertimos al espacio visible con el propio viewport.
        const [rx1, ry1, rx2, ry2] = viewport.convertToViewportRectangle(a.rect) as number[];
        const left = Math.min(rx1!, rx2!) / viewport.width;
        const top = Math.min(ry1!, ry2!) / viewport.height;
        const width = Math.abs(rx2! - rx1!) / viewport.width;
        const height = Math.abs(ry2! - ry1!) / viewport.height;
        const targetPage = a.url ? undefined : await resolvePage(a.dest);
        if (!a.url && !targetPage) continue;
        links.push({
          top: top * 100,
          left: left * 100,
          width: width * 100,
          height: height * 100,
          ...(a.url ? { url: a.url } : {}),
          ...(targetPage ? { targetPage } : {}),
        });
      }

      pages.push({
        number: n,
        width: base.width,
        height: base.height,
        imageUrl,
        links,
        text,
      });
      page.cleanup();
      onProgress?.(n, doc.numPages);
    }

    const outline: OutlineEntry[] = [];
    try {
      const raw = await doc.getOutline();
      const walk = async (
        items: Array<{ title: string; dest: unknown; items?: unknown[] }>,
        depth: number,
      ) => {
        for (const item of items) {
          const page = await resolvePage(item.dest);
          if (page) outline.push({ title: item.title, page, depth });
          if (item.items?.length)
            await walk(item.items as Array<{ title: string; dest: unknown }>, depth + 1);
        }
      };
      if (raw) await walk(raw as never, 0);
    } catch (error) {
      console.warn("[flipbook] sin índice", error);
    }

    await doc.destroy();
    return { pages, outline };
  } catch (error) {
    disposeFlipbookDocument({ pages, outline: [] });
    await doc.destroy().catch(() => undefined);
    throw error;
  }
}
