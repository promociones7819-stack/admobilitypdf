/**
 * Exportación de una publicación flipbook completa y autónoma (.zip).
 *
 * Todo se resuelve en el navegador: se copian el PDF original, las librerías
 * locales (pdf.js + StPageFlip), la configuración de hotspots, el índice del
 * PDF y un visor estático. No interviene ningún servidor ni API.
 */
// Se importan como texto (?raw) para copiar el código original sin que el
// bundler lo transforme: el visor autónomo debe funcionar sin dev server.
import pdfLibSource from "pdfjs-dist/build/pdf.min.mjs?raw";
import pdfWorkerSource from "pdfjs-dist/build/pdf.worker.min.mjs?raw";
import pageFlipSource from "page-flip/dist/js/page-flip.browser.js?raw";

import indexHtml from "./standalone/index.html.txt?raw";
import viewerJs from "./standalone/viewer.js.txt?raw";
import stylesCss from "./standalone/styles.css.txt?raw";
import readme from "./standalone/LEEME.txt?raw";
import serverPy from "./standalone/servidor.py.txt?raw";
import startWin from "./standalone/iniciar-windows.bat.txt?raw";
import startUnix from "./standalone/iniciar-mac-linux.command.txt?raw";

import type { OutlineEntry } from "./document";
import type { FlipbookConfig } from "./hotspots";


function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function publicationName(docName: string): string {
  const base = docName.replace(/\.pdf$/i, "").trim() || "flipbook";
  return base.replace(/[^\w\-. ]+/g, "_");
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
  folder.file("LEEME.txt", readme);
  folder.file("servidor.py", serverPy);
  folder.file("iniciar-windows.bat", startWin);
  folder.file("iniciar-mac-linux.command", startUnix, { unixPermissions: "755" });

  const assets = folder.folder("assets")!;
  assets.file("viewer.js", viewerJs);
  assets.file("styles.css", stylesCss);

  const libs = folder.folder("libs")!;
  libs.file("pdf.min.mjs", pdfLibSource);
  libs.file("pdf.worker.min.mjs", pdfWorkerSource);
  libs.file("page-flip.browser.js", pageFlipSource);

  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}
