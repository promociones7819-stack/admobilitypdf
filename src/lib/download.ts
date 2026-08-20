/**
 * Guardado de ficheros compatible con navegadores de escritorio e iOS/iPadOS.
 *
 * En iPad/iPhone (Safari y todos los navegadores del sistema, que usan WebKit)
 * el atributo `download` de un enlace se ignora en muchos casos y la descarga
 * de un Blob generado tras una operación asíncrona se bloquea silenciosamente.
 * Por eso probamos, en orden:
 *   1. Web Share API con ficheros -> abre la hoja de "Guardar en Archivos".
 *   2. Enlace con `download` (escritorio y Android).
 *   3. Apertura del Blob en una pestaña nueva / misma pestaña como último recurso.
 */

function isAppleMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua);
  // iPadOS 13+ se identifica como Mac con soporte táctil.
  const iPadDesktopUa = /Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1;
  return iOS || iPadDesktopUa;
}

function supportsDownloadAttribute(): boolean {
  if (typeof document === "undefined") return false;
  return "download" in document.createElement("a");
}

async function shareFile(blob: Blob, fileName: string, type: string): Promise<boolean> {
  try {
    const nav = navigator as Navigator & {
      canShare?: (data: ShareData) => boolean;
      share?: (data: ShareData) => Promise<void>;
    };
    if (!nav.share || !nav.canShare) return false;
    const file = new File([blob], fileName, { type });
    if (!nav.canShare({ files: [file] })) return false;
    await nav.share({ files: [file], title: fileName });
    return true;
  } catch (error) {
    // El usuario puede cancelar la hoja de compartir: no es un fallo real.
    const name = (error as { name?: string })?.name;
    if (name === "AbortError") return true; // cancelado por el usuario
    return false; // p. ej. NotAllowedError al perderse el gesto -> probamos enlace
  }
}

function anchorDownload(url: string, fileName: string): boolean {
  if (!supportsDownloadAttribute()) return false;
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  a.target = "_self";
  document.body.append(a);
  a.click();
  a.remove();
  return true;
}

/** Guarda un Blob con el nombre indicado, usando la mejor vía del dispositivo. */
export async function saveBlob(blob: Blob, fileName: string): Promise<void> {
  const type = blob.type || "application/octet-stream";

  if (isAppleMobile() && (await shareFile(blob, fileName, type))) return;

  const url = URL.createObjectURL(blob);
  const revoke = () => setTimeout(() => URL.revokeObjectURL(url), 10_000);

  if (anchorDownload(url, fileName)) {
    revoke();
    return;
  }

  // Último recurso: mostrar el fichero para que el usuario lo guarde a mano.
  const opened = window.open(url, "_blank");
  if (!opened) window.location.href = url;
  revoke();
}

/** Guarda bytes crudos como fichero con el tipo MIME indicado. */
export async function saveBytes(
  bytes: Uint8Array,
  fileName: string,
  type = "application/pdf",
): Promise<void> {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  await saveBlob(new Blob([buffer], { type }), fileName);
}
