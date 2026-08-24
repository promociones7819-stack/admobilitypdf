import {
  PDFDocument,
  StandardFonts,
  rgb,
  degrees,
  PDFName,
  PDFDict,
  PDFString,
  PDFHexString,
} from "pdf-lib";
import { getPdfjs } from "./pdfjs";

export interface DecorationOptions {
  watermark?: string;
  watermarkOpacity?: number;
  watermarkRotation?: number;
  header?: string;
  footer?: string;
  pageNumbers?: boolean;
  startNumber?: number;
  batesPrefix?: string;
  cleanMetadata?: boolean;
}

function safeText(value: string, max = 500): string {
  return value
    .replace(/[\r\n\t]+/g, " ")
    .trim()
    .slice(0, max);
}

export async function decoratePdf(
  bytes: Uint8Array,
  options: DecorationOptions,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes.slice(0), {
    ignoreEncryption: true,
    throwOnInvalidObject: false,
    updateMetadata: false,
  });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const watermark = safeText(options.watermark ?? "");
  const header = safeText(options.header ?? "");
  const footer = safeText(options.footer ?? "");
  const pages = doc.getPages();
  pages.forEach((page, index) => {
    const { width, height } = page.getSize();
    if (watermark) {
      const size = Math.max(22, Math.min(72, width / Math.max(7, watermark.length * 0.52)));
      const textWidth = font.widthOfTextAtSize(watermark, size);
      page.drawText(watermark, {
        x: Math.max(18, (width - textWidth) / 2),
        y: height / 2,
        size,
        font,
        color: rgb(0.35, 0.35, 0.35),
        opacity: Math.max(0.04, Math.min(0.8, options.watermarkOpacity ?? 0.18)),
        rotate: degrees(options.watermarkRotation ?? 35),
      });
    }
    if (header)
      page.drawText(header, {
        x: 30,
        y: height - 24,
        size: 9,
        font,
        color: rgb(0.25, 0.25, 0.25),
        maxWidth: Math.max(10, width - 60),
      });
    if (footer)
      page.drawText(footer, {
        x: 30,
        y: 18,
        size: 9,
        font,
        color: rgb(0.25, 0.25, 0.25),
        maxWidth: Math.max(10, width - 110),
      });
    if (options.pageNumbers) {
      const number = (options.startNumber ?? 1) + index;
      const label = options.batesPrefix
        ? `${safeText(options.batesPrefix, 30)}${String(number).padStart(6, "0")}`
        : String(number);
      const tw = bold.widthOfTextAtSize(label, 9);
      page.drawText(label, {
        x: width - 30 - tw,
        y: 18,
        size: 9,
        font: bold,
        color: rgb(0.15, 0.15, 0.15),
      });
    }
  });
  if (options.cleanMetadata) {
    doc.setTitle("");
    doc.setAuthor("");
    doc.setSubject("");
    doc.setKeywords([]);
    doc.setCreator("PDF Maestro");
    doc.setProducer("PDF Maestro");
  }
  return doc.save({ useObjectStreams: true, addDefaultPage: false });
}

export interface PdfTextPage {
  page: number;
  text: string;
}

export async function extractPdfText(bytes: Uint8Array): Promise<PdfTextPage[]> {
  const pdfjs = await getPdfjs();
  const doc = await pdfjs.getDocument({ data: bytes.slice(0), stopAtErrors: false }).promise;
  const pages: PdfTextPage[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      pages.push({ page: pageNumber, text });
      page.cleanup();
    }
    return pages;
  } finally {
    await doc.destroy().catch(() => undefined);
  }
}

function words(value: string): Set<string> {
  return new Set(
    value
      .toLocaleLowerCase("es")
      .split(/[^\p{L}\p{N}]+/u)
      .filter((word) => word.length > 2),
  );
}

export interface ComparisonPage {
  page: number;
  similarity: number;
  added: string[];
  removed: string[];
}

export async function comparePdfText(
  left: Uint8Array,
  right: Uint8Array,
): Promise<ComparisonPage[]> {
  const [a, b] = await Promise.all([extractPdfText(left), extractPdfText(right)]);
  const total = Math.max(a.length, b.length);
  return Array.from({ length: total }, (_, index) => {
    const aw = words(a[index]?.text ?? "");
    const bw = words(b[index]?.text ?? "");
    const common = [...aw].filter((word) => bw.has(word)).length;
    const union = new Set([...aw, ...bw]).size;
    return {
      page: index + 1,
      similarity: union ? Math.round((common / union) * 100) : aw.size === bw.size ? 100 : 0,
      added: [...bw].filter((word) => !aw.has(word)).slice(0, 30),
      removed: [...aw].filter((word) => !bw.has(word)).slice(0, 30),
    };
  });
}

export interface VisualComparisonPage {
  page: number;
  changedPercent: number;
  image: string;
}

export async function comparePdfVisual(
  left: Uint8Array,
  right: Uint8Array,
): Promise<VisualComparisonPage[]> {
  const pdfjs = await getPdfjs();
  const [a, b] = await Promise.all([
    pdfjs.getDocument({ data: left.slice(0), stopAtErrors: false }).promise,
    pdfjs.getDocument({ data: right.slice(0), stopAtErrors: false }).promise,
  ]);
  const total = Math.max(a.numPages, b.numPages);
  const results: VisualComparisonPage[] = [];
  try {
    for (let number = 1; number <= total; number += 1) {
      const [ap, bp] = await Promise.all([
        number <= a.numPages ? a.getPage(number) : null,
        number <= b.numPages ? b.getPage(number) : null,
      ]);
      const reference = ap ?? bp;
      if (!reference) continue;
      const base = reference.getViewport({ scale: 1 });
      const scale = Math.min(1, 720 / Math.max(1, base.width));
      const viewport = reference.getViewport({ scale });
      const width = Math.max(1, Math.round(viewport.width));
      const height = Math.max(1, Math.round(viewport.height));
      const render = async (page: typeof ap) => {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d", { alpha: false })!;
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, width, height);
        if (page)
          await page.render({
            canvas,
            canvasContext: ctx,
            viewport: page.getViewport({ scale }),
          } as Parameters<typeof page.render>[0]).promise;
        return { canvas, ctx, data: ctx.getImageData(0, 0, width, height) };
      };
      const [ar, br] = await Promise.all([render(ap), render(bp)]);
      const out = document.createElement("canvas");
      out.width = width;
      out.height = height;
      const ctx = out.getContext("2d")!;
      const image = ctx.createImageData(width, height);
      let changed = 0;
      for (let offset = 0; offset < image.data.length; offset += 4) {
        const delta =
          Math.abs(ar.data.data[offset]! - br.data.data[offset]!) +
          Math.abs(ar.data.data[offset + 1]! - br.data.data[offset + 1]!) +
          Math.abs(ar.data.data[offset + 2]! - br.data.data[offset + 2]!);
        if (delta > 75) {
          image.data[offset] = 230;
          image.data[offset + 1] = 35;
          image.data[offset + 2] = 50;
          image.data[offset + 3] = 230;
          changed += 1;
        } else {
          const grey = Math.round(
            (br.data.data[offset]! + br.data.data[offset + 1]! + br.data.data[offset + 2]!) / 3,
          );
          image.data[offset] = grey;
          image.data[offset + 1] = grey;
          image.data[offset + 2] = grey;
          image.data[offset + 3] = 95;
        }
      }
      ctx.putImageData(image, 0, 0);
      results.push({
        page: number,
        changedPercent: Number(((changed / (width * height)) * 100).toFixed(2)),
        image: out.toDataURL("image/png"),
      });
      ar.canvas.width = 0;
      br.canvas.width = 0;
      out.width = 0;
      ap?.cleanup();
      bp?.cleanup();
    }
    return results;
  } finally {
    await Promise.all([a.destroy().catch(() => undefined), b.destroy().catch(() => undefined)]);
  }
}

export async function inspectPdf(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes.slice(0), {
    ignoreEncryption: true,
    throwOnInvalidObject: false,
    updateMetadata: false,
  });
  const form = doc.getForm();
  const structTree = doc.catalog.lookupMaybe(PDFName.of("StructTreeRoot"), PDFDict);
  const markInfo = doc.catalog.lookupMaybe(PDFName.of("MarkInfo"), PDFDict);
  const languageObject = doc.catalog.get(PDFName.of("Lang"));
  const language =
    languageObject instanceof PDFString || languageObject instanceof PDFHexString
      ? languageObject.decodeText()
      : "";
  const raw = new TextDecoder("latin1").decode(bytes.slice(0, Math.min(bytes.length, 2_000_000)));
  const hasXmp = /<\?xpacket|<x:xmpmeta/i.test(raw);
  const pdfAClaim = /pdfaid:part[^>]*>\s*([1234])/i.exec(raw)?.[1] ?? "";
  const tagged = Boolean(structTree && markInfo);
  return {
    pages: doc.getPageCount(),
    title: doc.getTitle() ?? "",
    author: doc.getAuthor() ?? "",
    subject: doc.getSubject() ?? "",
    creator: doc.getCreator() ?? "",
    producer: doc.getProducer() ?? "",
    formFields: form.getFields().length,
    tagged,
    language,
    hasXmp,
    pdfAClaim,
    accessibilityScore:
      [tagged, Boolean(language), hasXmp, Boolean(doc.getTitle())].filter(Boolean).length * 25,
  };
}

export async function addQrCodeToPdf(
  bytes: Uint8Array,
  value: string,
  options: { page?: number; allPages?: boolean; size?: number } = {},
): Promise<Uint8Array> {
  const QRCode = await import("qrcode");
  const dataUrl = await QRCode.toDataURL(value, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 512,
  });
  const imageBytes = Uint8Array.from(atob(dataUrl.split(",")[1] ?? ""), (char) =>
    char.charCodeAt(0),
  );
  const doc = await PDFDocument.load(bytes.slice(0), {
    ignoreEncryption: true,
    throwOnInvalidObject: false,
  });
  const image = await doc.embedPng(imageBytes);
  const pages = doc.getPages();
  const targets = options.allPages
    ? pages
    : [pages[Math.max(0, Math.min(pages.length - 1, (options.page ?? 1) - 1))]!];
  const size = Math.max(36, Math.min(180, options.size ?? 82));
  for (const page of targets) {
    page.drawImage(image, { x: page.getWidth() - size - 24, y: 24, width: size, height: size });
  }
  return doc.save({ useObjectStreams: true });
}
