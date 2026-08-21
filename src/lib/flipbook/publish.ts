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
import viewerJs from "./standalone/viewer.js.txt?raw";
import stylesCss from "./standalone/styles.css.txt?raw";
import readme from "./standalone/README.txt?raw";
import leeme from "./standalone/LEEME.txt?raw";
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
  folder.file("README.txt", readme);
  folder.file("LEEME.txt", leeme);
  folder.file("package.json", packageJson.replaceAll("__TITLE__", title));
  folder.file("server.mjs", serverMjs);
  folder.file("servidor.py", serverPy);
  folder.file("iniciar-windows.bat", startWin);
  folder.file("iniciar-mac-linux.command", startUnix, { unixPermissions: "755" });

  const assets = folder.folder("assets")!;
  assets.file("viewer.js", viewerJs);
  assets.file("styles.css", stylesCss);

  const libs = folder.folder("libs")!;
  const sources = await Promise.all(LIB_FILES.map((lib) => fetchLib(lib.url)));
  LIB_FILES.forEach((lib, index) => {
    libs.file(lib.name, sources[index]!);
  });

  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}
