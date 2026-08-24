import { saveBlob } from "@/lib/download";
// Conversión local Word <-> PDF. Todo ocurre en el navegador:
// DOCX -> HTML (mammoth) -> maquetado con pdf-lib.
// PDF -> texto por páginas (pdf.js) -> DOCX (docx).
import { getPdfjs } from "@/lib/pdf/pdfjs";

export interface Block {
  text: string;
  size: number;
  bold: boolean;
  italic: boolean;
  bullet: boolean;
  spaceAfter: number;
}

const HEADING_SIZE: Record<string, number> = {
  H1: 22,
  H2: 18,
  H3: 15,
  H4: 13,
};

/** Sustituye lo que Helvetica (WinAnsi) no puede codificar. */
function sanitize(value: string): string {
  const punctuation = value
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...");
  return Array.from(punctuation, (character) =>
    (character.codePointAt(0) ?? 0) <= 0xff ? character : "?",
  ).join("");
}

function htmlToBlocks(html: string): Block[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const blocks: Block[] = [];

  const walk = (node: Element, inherited: { bold: boolean; italic: boolean }) => {
    for (const child of Array.from(node.children)) {
      const tag = child.tagName.toUpperCase();
      if (tag === "UL" || tag === "OL" || tag === "TABLE" || tag === "TBODY" || tag === "TR") {
        walk(child, inherited);
        continue;
      }
      const text = (child.textContent ?? "").replace(/\s+/g, " ").trim();
      if (!text) continue;
      const heading = HEADING_SIZE[tag];
      blocks.push({
        text,
        size: heading ?? 11,
        bold: Boolean(heading) || tag === "STRONG" || tag === "B",
        italic: tag === "EM" || tag === "I",
        bullet: tag === "LI" || tag === "TD" || tag === "TH",
        spaceAfter: heading ? 8 : 6,
      });
    }
  };

  walk(doc.body, { bold: false, italic: false });
  if (blocks.length === 0) {
    const fallback = (doc.body.textContent ?? "").trim();
    if (fallback) {
      blocks.push({
        text: fallback,
        size: 11,
        bold: false,
        italic: false,
        bullet: false,
        spaceAfter: 6,
      });
    }
  }
  return blocks;
}

/** Convierte un .docx en bytes de PDF (A4, márgenes de 56 pt). */
export async function docxToPdf(file: File): Promise<Uint8Array> {
  const [{ default: mammoth }, { PDFDocument, StandardFonts, rgb }] = await Promise.all([
    import("mammoth/mammoth.browser.js") as Promise<{
      default: {
        convertToHtml: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }>;
      };
    }>,
    import("pdf-lib"),
  ]);

  const arrayBuffer = await file.arrayBuffer();
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer });
  const blocks = htmlToBlocks(html);

  const out = await PDFDocument.create();
  const fonts = {
    regular: await out.embedFont(StandardFonts.Helvetica),
    bold: await out.embedFont(StandardFonts.HelveticaBold),
    italic: await out.embedFont(StandardFonts.HelveticaOblique),
  };

  const width = 595.28;
  const height = 841.89;
  const margin = 56;
  let page = out.addPage([width, height]);
  let cursor = height - margin;

  const newPage = () => {
    page = out.addPage([width, height]);
    cursor = height - margin;
  };

  for (const block of blocks) {
    const font = block.bold ? fonts.bold : block.italic ? fonts.italic : fonts.regular;
    const indent = block.bullet ? 16 : 0;
    const maxWidth = width - margin * 2 - indent;
    const lineHeight = block.size * 1.4;
    const words = sanitize(block.text).split(" ");
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, block.size) > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);

    lines.forEach((line, index) => {
      if (cursor - lineHeight < margin) newPage();
      cursor -= lineHeight;
      if (block.bullet && index === 0) {
        page.drawText("•", {
          x: margin,
          y: cursor,
          size: block.size,
          font: fonts.regular,
          color: rgb(0.25, 0.25, 0.25),
        });
      }
      page.drawText(line, {
        x: margin + indent,
        y: cursor,
        size: block.size,
        font,
        color: rgb(0.1, 0.1, 0.12),
      });
    });
    cursor -= block.spaceAfter;
  }

  if (blocks.length === 0) {
    page.drawText("Documento vacio", {
      x: margin,
      y: height - margin,
      size: 11,
      font: fonts.regular,
    });
  }

  return out.save();
}

/** Extrae el texto de un PDF y genera un .docx editable (un salto por página). */
export async function pdfToDocx(file: File, onProgress?: (ratio: number) => void): Promise<Blob> {
  const [pdfjs, docxLib] = await Promise.all([getPdfjs(), import("docx")]);
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, PageBreak, AlignmentType } = docxLib;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data: bytes.slice(0) }).promise;
  const children: InstanceType<typeof Paragraph>[] = [];

  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    let text = "";
    for (const item of content.items as Array<{ str?: string; hasEOL?: boolean }>) {
      if (typeof item.str !== "string") continue;
      text += item.str;
      text += item.hasEOL ? "\n" : " ";
    }
    page.cleanup();

    if (i > 1) children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        alignment: AlignmentType.LEFT,
        children: [new TextRun({ text: `Página ${i}`, bold: true })],
      }),
    );

    const paragraphs = text
      .replace(/[ \t]+/g, " ")
      .split(/\n{1,}/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (paragraphs.length === 0) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: "(sin texto extraíble)", italics: true })],
        }),
      );
    }
    for (const paragraph of paragraphs) {
      children.push(new Paragraph({ children: [new TextRun(paragraph)], spacing: { after: 120 } }));
    }
    onProgress?.(i / doc.numPages);
  }
  void doc.destroy();

  const output = new Document({
    styles: { default: { document: { run: { font: "Arial", size: 22 } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBlob(output);
}

export async function downloadBlob(blob: Blob, name: string) {
  await saveBlob(blob, name);
}

export function swapExtension(name: string, extension: string): string {
  return `${name.replace(/\.[^.]+$/, "")}.${extension}`;
}
