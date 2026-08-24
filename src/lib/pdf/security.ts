import { PDFDocument } from "pdf-lib";
import { getPdfjs } from "./pdfjs";

/**
 * Rebuilds every page from pixels. This is deliberately used for permanent
 * redaction: text, vector objects, attachments, forms and hidden layers from
 * the source can no longer be recovered underneath the black rectangles.
 */
export async function flattenForSecureRedaction(
  bytes: Uint8Array,
  onProgress?: (done: number, total: number) => void,
): Promise<Uint8Array> {
  const pdfjs = await getPdfjs();
  const source = await pdfjs.getDocument({ data: bytes.slice(0), stopAtErrors: false }).promise;
  const output = await PDFDocument.create();
  output.setTitle("Documento censurado");
  output.setProducer("PDF Maestro");
  output.setCreator("PDF Maestro");
  try {
    for (let index = 1; index <= source.numPages; index += 1) {
      const page = await source.getPage(index);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(2.2, 1800 / Math.max(1, base.width));
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(viewport.width));
      canvas.height = Math.max(1, Math.round(viewport.height));
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("canvas-2d-unavailable");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: context, viewport } as Parameters<
        typeof page.render
      >[0]).promise;
      const imageBytes = new Uint8Array(
        await new Promise<ArrayBuffer>((resolve, reject) =>
          canvas.toBlob(
            (blob) =>
              blob ? blob.arrayBuffer().then(resolve, reject) : reject(new Error("image")),
            "image/jpeg",
            0.92,
          ),
        ),
      );
      const image = await output.embedJpg(imageBytes);
      const target = output.addPage([base.width, base.height]);
      target.drawImage(image, { x: 0, y: 0, width: base.width, height: base.height });
      canvas.width = 0;
      canvas.height = 0;
      page.cleanup();
      onProgress?.(index, source.numPages);
    }
    return output.save({ useObjectStreams: true });
  } finally {
    await source.destroy().catch(() => undefined);
  }
}

/** Removes common identifying metadata without altering visible page content. */
export async function cleanPdfMetadata(bytes: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes.slice(0), {
    ignoreEncryption: true,
    throwOnInvalidObject: false,
    updateMetadata: false,
  });
  doc.setTitle("");
  doc.setAuthor("");
  doc.setSubject("");
  doc.setKeywords([]);
  doc.setCreator("PDF Maestro");
  doc.setProducer("PDF Maestro");
  return doc.save({ useObjectStreams: true, addDefaultPage: false });
}

/** Creates a local PAdES-compatible detached signature using a P12/PFX certificate. */
export async function signPdfWithP12(options: {
  pdf: Uint8Array;
  certificate: Uint8Array;
  passphrase?: string;
  name?: string;
  reason?: string;
  location?: string;
}): Promise<Uint8Array> {
  // Ruta explícita al polyfill web: evita que Vite lo confunda con el módulo nativo de Node.
  const { Buffer } = await import("../../../node_modules/buffer/index.js");
  (globalThis as unknown as { Buffer?: unknown }).Buffer = Buffer;
  const [{ pdflibAddPlaceholder }, { P12Signer }, signModule, utils] = await Promise.all([
    import("@signpdf/placeholder-pdf-lib"),
    import("@signpdf/signer-p12"),
    import("@signpdf/signpdf"),
    import("@signpdf/utils"),
  ]);
  const normalizedDoc = await PDFDocument.load(options.pdf.slice(0), {
    ignoreEncryption: true,
    throwOnInvalidObject: false,
    updateMetadata: false,
  });
  pdflibAddPlaceholder({
    pdfDoc: normalizedDoc,
    reason: options.reason?.trim() || "Aprobación del documento",
    contactInfo: "",
    name: options.name?.trim() || "Firmante",
    location: options.location?.trim() || "",
    signingTime: new Date(),
    signatureLength: 32768,
    subFilter: utils.SUBFILTER_ETSI_CADES_DETACHED,
    appName: "PDF Maestro",
  });
  const placeholder = await normalizedDoc.save({ useObjectStreams: false });
  const signer = new P12Signer(Buffer.from(options.certificate), {
    passphrase: options.passphrase ?? "",
    asn1StrictParsing: false,
  });
  const signed = await new signModule.SignPdf().sign(placeholder, signer, new Date());
  return new Uint8Array(signed);
}
