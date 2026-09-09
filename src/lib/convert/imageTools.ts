import { downloadBlob } from "@/lib/convert/wordPdf";

export const PNG_ACCEPT = ".png,image/png";
export const BACKGROUND_IMAGE_ACCEPT = ".png,.jpg,.jpeg,image/png,image/jpeg";

function baseName(name: string): string {
  return name.replace(/\.(png|jpe?g)$/i, "").trim() || "imagen";
}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se ha podido leer la imagen."));
    };
    image.src = url;
  });
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("No se ha podido crear la imagen."))),
      type,
      quality,
    );
  });
}

/** Convierte un PNG a JPEG en el navegador y compone su transparencia sobre blanco. */
export async function pngToJpeg(file: File, quality = 0.92): Promise<Blob> {
  if (!/\.png$/i.test(file.name) && file.type !== "image/png") {
    throw new Error("Selecciona una imagen PNG.");
  }

  const image = await loadImage(file);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("El navegador no permite procesar esta imagen.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0);
  return canvasBlob(canvas, "image/jpeg", quality);
}

/** Elimina el fondo localmente con U²-NetP y conserva el resultado como PNG transparente. */
export async function removeImageBackground(
  file: File,
  onProgress?: (progress: number) => void,
): Promise<Blob> {
  if (!/\.(png|jpe?g)$/i.test(file.name) && !/image\/(png|jpeg)/i.test(file.type)) {
    throw new Error("Selecciona una imagen PNG, JPG o JPEG.");
  }

  const { newSession, remove, rembgConfig } = await import("@bunnio/rembg-web");
  rembgConfig.setBaseUrl("/models");
  const session = await newSession("u2netp");
  return remove(file, {
    session,
    postProcessMask: true,
    onProgress: ({ progress }) => onProgress?.(Math.max(0, Math.min(1, progress / 100))),
  });
}

export async function downloadJpeg(blob: Blob, originalName: string): Promise<void> {
  await downloadBlob(blob, `${baseName(originalName)}.jpg`);
}

export async function downloadTransparentPng(blob: Blob, originalName: string): Promise<void> {
  await downloadBlob(blob, `${baseName(originalName)}-sin-fondo.png`);
}
