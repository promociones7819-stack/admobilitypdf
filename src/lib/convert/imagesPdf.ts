import { saveBlob } from "@/lib/download";

const A4_PORTRAIT = { width: 595.28, height: 841.89 };
const PAGE_MARGIN = 24;

export const IMAGE_PDF_ACCEPT = ".jpg,.jpeg,.heic,.heif,image/jpeg,image/heic,image/heif";

function isHeic(file: File): boolean {
  return /\.(heic|heif)$/i.test(file.name) || /image\/hei[cf]/i.test(file.type);
}

function isJpeg(file: File): boolean {
  return /\.(jpe?g)$/i.test(file.name) || file.type === "image/jpeg";
}

async function jpegBytes(file: File): Promise<Uint8Array> {
  if (isJpeg(file)) return new Uint8Array(await file.arrayBuffer());
  if (!isHeic(file)) throw new Error(`Formato no compatible: ${file.name}`);

  const { default: heic2any } = await import("heic2any");
  const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
  const first = Array.isArray(converted) ? converted[0] : converted;
  if (!first) throw new Error(`No se ha podido convertir ${file.name}`);
  return new Uint8Array(await first.arrayBuffer());
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
    const bytes = await jpegBytes(file);
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
