import { saveBlob } from "@/lib/download";

const A4_PORTRAIT = { width: 595.28, height: 841.89 };
const PAGE_MARGIN = 24;
const MAX_IMAGE_EDGE = 4096;
const HEIC_TIMEOUT_MS = 90_000;

export const IMAGE_PDF_ACCEPT = ".jpg,.jpeg,.heic,.heif,image/jpeg,image/heic,image/heif";

function isHeic(file: File): boolean {
  return /\.(heic|heif)$/i.test(file.name) || /image\/hei[cf]/i.test(file.type);
}

function isJpeg(file: File): boolean {
  return /\.(jpe?g)$/i.test(file.name) || file.type === "image/jpeg";
}

function withTimeout<T>(promise: Promise<T>, fileName: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(
      () => reject(new Error(`La conversión de ${fileName} está tardando demasiado.`)),
      HEIC_TIMEOUT_MS,
    );
    promise.then(
      (value) => {
        window.clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

async function decodeImage(blob: Blob, fileName: string): Promise<ImageBitmap> {
  if (typeof createImageBitmap !== "function") {
    throw new Error(`Este dispositivo no puede preparar ${fileName} para PDF.`);
  }
  try {
    return await createImageBitmap(blob, { imageOrientation: "from-image" });
  } catch {
    throw new Error(`No se ha podido leer la imagen ${fileName}. Puede estar dañada.`);
  }
}

function canvasJpeg(canvas: HTMLCanvasElement, fileName: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error(`No se ha podido preparar ${fileName} para PDF.`)),
      "image/jpeg",
      0.9,
    );
  });
}

async function normalizedJpegBytes(file: File): Promise<Uint8Array> {
  if (!isJpeg(file) && !isHeic(file)) throw new Error(`Formato no compatible: ${file.name}`);

  let source: Blob = file;
  if (isHeic(file)) {
    const { default: heic2any } = await import("heic2any");
    let converted: Blob | Blob[];
    try {
      converted = await withTimeout(
        heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 }),
        file.name,
      );
    } catch (error) {
      if (error instanceof Error && error.message.includes("tardando demasiado")) throw error;
      throw new Error(`No se ha podido convertir el archivo HEIC ${file.name}.`);
    }
    const first = Array.isArray(converted) ? converted[0] : converted;
    if (!first) throw new Error(`No se ha podido convertir ${file.name}`);
    source = first;
  }

  const image = await decodeImage(source, file.name);
  try {
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error(`No se ha podido preparar ${file.name} para PDF.`);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    const jpeg = await canvasJpeg(canvas, file.name);
    canvas.width = 1;
    canvas.height = 1;
    return new Uint8Array(await jpeg.arrayBuffer());
  } finally {
    image.close();
  }
}

/** Crea un PDF A4, con una fotografía por página y sin subir nada a Internet. */
export async function imagesToPdf(
  files: File[],
  onProgress?: (done: number, total: number) => void,
): Promise<Uint8Array> {
  if (files.length === 0) throw new Error("Selecciona al menos una imagen.");
  const { PDFDocument, rgb } = await import("pdf-lib");
  const output = await PDFDocument.create();

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index]!;
    // Da tiempo al navegador para pintar el progreso antes de decodificar fotos grandes.
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    onProgress?.(index, files.length);
    const bytes = await normalizedJpegBytes(file);
    const image = await output.embedJpg(bytes);
    const landscape = image.width > image.height;
    const pageWidth = landscape ? A4_PORTRAIT.height : A4_PORTRAIT.width;
    const pageHeight = landscape ? A4_PORTRAIT.width : A4_PORTRAIT.height;
    const page = output.addPage([pageWidth, pageHeight]);
    page.drawRectangle({
      x: 0,
      y: 0,
      width: pageWidth,
      height: pageHeight,
      color: rgb(1, 1, 1),
    });
    const scale = Math.min(
      (pageWidth - PAGE_MARGIN * 2) / image.width,
      (pageHeight - PAGE_MARGIN * 2) / image.height,
    );
    const width = image.width * scale;
    const height = image.height * scale;
    page.drawImage(image, {
      x: (pageWidth - width) / 2,
      y: (pageHeight - height) / 2,
      width,
      height,
    });
    onProgress?.(index + 1, files.length);
  }

  output.setTitle(files.length === 1 ? files[0]!.name : "Fotografías");
  return output.save({ useObjectStreams: true });
}

export function imagesPdfName(files: File[]): string {
  if (files.length !== 1) return "fotos-convertidas.pdf";
  const base = files[0]!.name.replace(/\.(jpe?g|heic|heif)$/i, "").trim() || "foto";
  return `${base}.pdf`;
}

export async function downloadImagePdf(bytes: Uint8Array, name: string): Promise<void> {
  await saveBlob(
    new Blob([bytes.slice(0) as unknown as BlobPart], { type: "application/pdf" }),
    name,
  );
}
