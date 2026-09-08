import JSZip from "jszip";
import { getPdfjs } from "@/lib/pdf/pdfjs";

const JPG_SCALE = 2;
const JPG_QUALITY = 0.92;

export interface PdfJpgResult {
  blob: Blob;
  fileName: string;
  pageCount: number;
}

function baseName(name: string): string {
  return name.replace(/\.pdf$/i, "") || "documento";
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("No se ha podido crear la imagen JPG."))),
      "image/jpeg",
      JPG_QUALITY,
    );
  });
}

/** Renderiza cada página del PDF como JPG, enteramente en el navegador. */
export async function pdfToJpg(
  file: File,
  onProgress?: (ratio: number) => void,
): Promise<PdfJpgResult> {
  const pdfjs = await getPdfjs();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data: bytes.slice(0) }).promise;
  const name = baseName(file.name);
  const pageDigits = Math.max(2, String(pdf.numPages).length);
  const zip = pdf.numPages > 1 ? new JSZip() : null;
  let singlePage: Blob | null = null;

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: JPG_SCALE });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("El navegador no permite generar imágenes de este PDF.");

      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      const jpeg = await canvasToJpeg(canvas);
      page.cleanup();
      canvas.width = 1;
      canvas.height = 1;

      if (zip) {
        zip.file(`${name}-pagina-${String(pageNumber).padStart(pageDigits, "0")}.jpg`, jpeg);
      } else {
        singlePage = jpeg;
      }
      onProgress?.(pageNumber / pdf.numPages);
    }

    if (zip) {
      return {
        blob: await zip.generateAsync({ type: "blob", compression: "DEFLATE" }),
        fileName: `${name}-jpg.zip`,
        pageCount: pdf.numPages,
      };
    }
    if (!singlePage) throw new Error("El PDF no contiene páginas para convertir.");
    return { blob: singlePage, fileName: `${name}.jpg`, pageCount: 1 };
  } finally {
    await pdf.destroy();
  }
}
