/**
 * Exportación de una publicación flipbook completa y autónoma (.zip).
 *
 * Todo se resuelve en el navegador: se copian el PDF original, las librerías
 * locales (pdf.js + StPageFlip), la configuración de hotspots, el índice del
 * PDF y un visor estático. No interviene ningún servidor ni API.
 */
// Las librerías del visor se sirven como archivos estáticos desde /flipbook-libs
// y se descargan en el navegador al exportar: así se copian sin que el bundler
// las transforme y sin inflar el bundle del servidor.
const LIB_FILES = [
  { name: "pdf.min.mjs", url: "/flipbook-libs/pdf.min.mjs" },
  { name: "pdf.worker.min.mjs", url: "/flipbook-libs/pdf.worker.min.mjs" },
  { name: "page-flip.browser.js", url: "/flipbook-libs/page-flip.browser.js" },
] as const;

async function fetchLib(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo leer la librería ${url} (${res.status})`);
  return res.arrayBuffer();
}

import indexHtml from "./standalone/index.html.txt?raw";
import singleHtml from "./standalone/single.html.txt?raw";
import singleViewerJs from "./standalone/single-viewer.js.txt?raw";
import viewerJs from "./standalone/viewer.js.txt?raw";
import stylesCss from "./standalone/styles.css.txt?raw";
import readme from "./standalone/README.txt?raw";
import leeme from "./standalone/LEEME.txt?raw";
import serverPy from "./standalone/servidor.py.txt?raw";
import startWin from "./standalone/iniciar-windows.bat.txt?raw";
import startUnix from "./standalone/iniciar-mac-linux.command.txt?raw";

import type { FlipbookPage, OutlineEntry } from "./document";
import type { FlipbookConfig } from "./hotspots";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeJsonForHtml(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function escapeInlineScript(value: string): string {
  return value.replace(/<\/script/gi, "<\\/script");
}

function arrayBufferToDataUrl(buffer: ArrayBuffer, mimeType: string): Promise<string> {
  return blobToDataUrl(new Blob([buffer], { type: mimeType }));
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("No se pudo incrustar el recurso"));
    reader.readAsDataURL(blob);
  });
}

export function publicationName(docName: string): string {
  const base = docName.replace(/\.pdf$/i, "").trim() || "flipbook";
  return base.replace(/[^\w\-. ]+/g, "_");
}

/** Genera un flipbook que funciona con doble clic, sin servidor ni archivos auxiliares. */
export async function buildSingleFlipbookHtml(options: {
  docName: string;
  pages: FlipbookPage[];
  config: FlipbookConfig;
  outline: OutlineEntry[];
}): Promise<string> {
  const title = publicationName(options.docName);
  const [pageFlipBuffer, brandBuffer] = await Promise.all([
    fetchLib("/flipbook-libs/page-flip.browser.js"),
    fetchLib("/brand/ad-mobility.png"),
  ]);
  const pageFlipJs = new TextDecoder().decode(pageFlipBuffer);
  const brandImage = await arrayBufferToDataUrl(brandBuffer, "image/png");
  const pages = await Promise.all(
    options.pages.map(async (page) => {
      const image = page.imageUrl.startsWith("data:")
        ? page.imageUrl
        : await blobToDataUrl(await (await fetch(page.imageUrl)).blob());
      return {
        number: page.number,
        width: page.width,
        height: page.height,
        image,
        links: page.links,
      };
    }),
  );
  const data = {
    menuPage: options.config.menuPage,
    hotspots: options.config.hotspots,
    bookmarks: options.outline,
    brandImage,
    pages,
  };

  return singleHtml
    .replaceAll("__TITLE__", escapeHtml(title))
    .replace("__CSS__", stylesCss)
    .replace("__DATA__", escapeJsonForHtml(data))
    .replace("__PAGEFLIP__", escapeInlineScript(pageFlipJs))
    .replace("__VIEWER__", escapeInlineScript(singleViewerJs));
}

export async function buildFlipbookZip(options: {
  file: File;
  docName: string;
  config: FlipbookConfig;
  outline: OutlineEntry[];
}): Promise<Blob> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const folder = zip.folder("flipbook");
  if (!folder) throw new Error("No se pudo crear el ZIP");

  const title = publicationName(options.docName);

  folder.file("index.html", indexHtml.replaceAll("__TITLE__", escapeHtml(title)));
  folder.file("document.pdf", await options.file.arrayBuffer());
  folder.file("hotspots.json", JSON.stringify(options.config, null, 2));
  folder.file("bookmarks.json", JSON.stringify(options.outline, null, 2));
  folder.file("README.txt", readme);
  folder.file("LEEME.txt", leeme);
  folder.file("servidor.py", serverPy, { unixPermissions: "755" });
  folder.file("iniciar-windows.bat", startWin);
  folder.file("iniciar-mac-linux.command", startUnix, { unixPermissions: "755" });

  const assets = folder.folder("assets")!;
  assets.file("viewer.js", viewerJs);
  assets.file("styles.css", stylesCss);
  assets.file("ad-mobility.png", await fetchLib("/brand/ad-mobility.png"));

  const libs = folder.folder("libs")!;
  const sources = await Promise.all(LIB_FILES.map((lib) => fetchLib(lib.url)));
  LIB_FILES.forEach((lib, index) => {
    libs.file(lib.name, sources[index]!);
  });

  return zip.generateAsync({ type: "blob", compression: "DEFLATE", platform: "UNIX" });
}
