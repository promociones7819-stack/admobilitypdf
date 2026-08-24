import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function xmlTexts(xml: string): string[] {
  return [...xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)]
    .map((match) => decodeXml(match[1] ?? "").trim())
    .filter(Boolean);
}

async function zipFrom(file: File) {
  const { default: JSZip } = await import("jszip");
  return JSZip.loadAsync(await file.arrayBuffer());
}

export async function powerpointToPdf(file: File): Promise<Uint8Array> {
  const zip = await zipFrom(file);
  const slideNames = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]));
  if (!slideNames.length) throw new Error("pptx-empty");
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  for (const [index, name] of slideNames.entries()) {
    const xml = await zip.file(name)!.async("text");
    const texts = xmlTexts(xml);
    const page = doc.addPage([842, 595]);
    page.drawRectangle({ x: 0, y: 0, width: 842, height: 595, color: rgb(1, 1, 1) });
    page.drawText(texts[0] || `Diapositiva ${index + 1}`, {
      x: 54,
      y: 515,
      size: 28,
      font: bold,
      color: rgb(0.08, 0.16, 0.3),
      maxWidth: 734,
    });
    let y = 458;
    for (const text of texts.slice(1)) {
      const words = text.split(/\s+/);
      let line = "";
      for (const word of words) {
        const next = line ? `${line} ${word}` : word;
        if (regular.widthOfTextAtSize(next, 15) > 720) {
          page.drawText(line, { x: 64, y, size: 15, font: regular, color: rgb(0.15, 0.18, 0.24) });
          y -= 22;
          line = word;
        } else line = next;
      }
      if (line && y > 45)
        page.drawText(line, { x: 64, y, size: 15, font: regular, color: rgb(0.15, 0.18, 0.24) });
      y -= 30;
      if (y < 45) break;
    }
    page.drawText(String(index + 1), {
      x: 790,
      y: 24,
      size: 10,
      font: regular,
      color: rgb(0.5, 0.5, 0.5),
    });
  }
  return doc.save({ useObjectStreams: true });
}

function columnNumber(reference: string): number {
  const letters = reference.match(/[A-Z]+/)?.[0] ?? "A";
  return [...letters].reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1;
}

export async function excelToPdf(file: File): Promise<Uint8Array> {
  const zip = await zipFrom(file);
  const sharedXml = await zip.file("xl/sharedStrings.xml")?.async("text");
  const shared = sharedXml
    ? [...sharedXml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((match) => decodeXml(match[1] ?? ""))
    : [];
  const sheetNames = Object.keys(zip.files)
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
    .sort();
  if (!sheetNames.length) throw new Error("xlsx-empty");
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  for (const [sheetIndex, name] of sheetNames.entries()) {
    const xml = await zip.file(name)!.async("text");
    const rows = [...xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((rowMatch) => {
      const cells: string[] = [];
      for (const cell of rowMatch[1]!.matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)) {
        const attrs = cell[1] ?? "";
        const body = cell[2] ?? "";
        const ref = attrs.match(/r="([A-Z]+\d+)"/)?.[1] ?? "A1";
        const raw =
          body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? body.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1] ?? "";
        const value = /t="s"/.test(attrs) ? (shared[Number(raw)] ?? raw) : decodeXml(raw);
        cells[columnNumber(ref)] = value;
      }
      return cells;
    });
    const columns = Math.min(10, Math.max(1, ...rows.map((row) => row.length)));
    const pageWidth = 842;
    const colWidth = (pageWidth - 64) / columns;
    let page = doc.addPage([pageWidth, 595]);
    let y = 535;
    const drawHeader = () => {
      page.drawText(`Hoja ${sheetIndex + 1}`, {
        x: 32,
        y: 563,
        size: 14,
        font: bold,
        color: rgb(0.08, 0.2, 0.35),
      });
    };
    drawHeader();
    for (const [rowIndex, row] of rows.entries()) {
      if (y < 42) {
        page = doc.addPage([pageWidth, 595]);
        y = 535;
        drawHeader();
      }
      if (rowIndex === 0)
        page.drawRectangle({
          x: 30,
          y: y - 5,
          width: pageWidth - 60,
          height: 22,
          color: rgb(0.9, 0.94, 0.98),
        });
      for (let column = 0; column < columns; column += 1) {
        page.drawText(String(row[column] ?? "").slice(0, 34), {
          x: 34 + column * colWidth,
          y,
          size: 8,
          font: rowIndex === 0 ? bold : font,
          color: rgb(0.12, 0.15, 0.2),
          maxWidth: colWidth - 5,
        });
      }
      y -= 23;
    }
  }
  return doc.save({ useObjectStreams: true });
}
