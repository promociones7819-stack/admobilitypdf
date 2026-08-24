import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export interface QuestionnaireAnswer {
  id: string;
  body: string;
  isCorrect: boolean;
}

export interface QuestionnaireQuestion {
  id: string;
  statement: string;
  explanation: string;
  answers: QuestionnaireAnswer[];
}

export interface QuestionnaireDocument {
  version: 1;
  title: string;
  description: string;
  questions: QuestionnaireQuestion[];
}

export function questionnaireId(prefix = "item"): string {
  const value = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return `${prefix}-${value}`;
}

export function createQuestion(index = 1): QuestionnaireQuestion {
  return {
    id: questionnaireId("question"),
    statement: `Pregunta ${index}`,
    explanation: "",
    answers: [
      { id: questionnaireId("answer"), body: "Opción 1", isCorrect: true },
      { id: questionnaireId("answer"), body: "Opción 2", isCorrect: false },
    ],
  };
}

function normalizeInlineText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Adapta el detector de preguntas de la app proporcionada para trabajar 100 % en local. */
export function parseQuestionnaireText(text: string): QuestionnaireQuestion[] {
  const normalized = text
    .replace(/---\s*P[áa]gina\s+\d+\s*---/gi, " ")
    .replace(/pregunta\s+(\d+)\s*[:.)-]\s*/gi, "$1. ")
    .replace(/(\d)\s+\./g, "$1.")
    .replace(/([A-Ha-h]|[1-8])\s+\)/g, "$1)")
    .replace(/\s+/g, " ")
    .trim();
  const questionRegex = /(?:^|\s)(\d{1,3})\.\s*(.+?)(?=(?:\s+\d{1,3}\.\s)|$)/gs;
  const optionRegex =
    /(?:^|\s)([A-Ha-h]|[1-8])(?:[-.:\x29\x5d])\s*(.+?)(?=(?:\s+(?:[A-Ha-h]|[1-8])(?:[-.:\x29\x5d])\s)|$)/gs;
  const explicitCorrect = /^\s*(?:\*|\[x\]|\(x\)|correcta:\s*)(.+)$/i;
  const questions: QuestionnaireQuestion[] = [];

  for (const match of normalized.matchAll(questionRegex)) {
    const chunk = match[2]?.trim() ?? "";
    const optionMatches = [...chunk.matchAll(optionRegex)];
    if (!chunk || optionMatches.length < 2) continue;
    const statement = normalizeInlineText(chunk.slice(0, optionMatches[0]?.index ?? 0));
    if (!statement) continue;
    const answers = optionMatches
      .map((option) => {
        const raw = option[2]?.trim() ?? "";
        const correct = raw.match(explicitCorrect);
        return {
          id: questionnaireId("answer"),
          body: normalizeInlineText(correct?.[1] ?? raw),
          isCorrect: Boolean(correct),
        };
      })
      .filter((answer) => answer.body.length > 0);
    if (answers.length < 2) continue;
    if (!answers.some((answer) => answer.isCorrect)) answers[0]!.isCorrect = true;
    questions.push({
      id: questionnaireId("question"),
      statement,
      explanation: "",
      answers,
    });
  }
  return questions.slice(0, 100);
}

function pdfSafeText(value: string): string {
  return value
    .normalize("NFC")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[^\x20-\x7e\u00a0-\u00ff]/g, "?");
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of pdfSafeText(text).split(/\r?\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      continue;
    }
    let line = words.shift()!;
    for (const word of words) {
      const candidate = `${line} ${word}`;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) line = candidate;
      else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

function drawLines(
  page: PDFPage,
  lines: string[],
  font: PDFFont,
  size: number,
  x: number,
  y: number,
  color = rgb(0.12, 0.16, 0.22),
): number {
  const lineHeight = size * 1.35;
  lines.forEach((line, index) =>
    page.drawText(line, { x, y: y - index * lineHeight, font, size, color }),
  );
  return y - lines.length * lineHeight;
}

export async function buildQuestionnairePdf(
  questionnaire: QuestionnaireDocument,
  options: { includeSolutions?: boolean } = {},
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const form = doc.getForm();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const width = 595.28;
  const height = 841.89;
  const margin = 48;
  const contentWidth = width - margin * 2;
  let page = doc.addPage([width, height]);
  let y = height - margin;

  const newPage = () => {
    page = doc.addPage([width, height]);
    y = height - margin;
  };
  const ensureSpace = (needed: number) => {
    if (y - needed < margin) newPage();
  };

  y = drawLines(
    page,
    wrapText(questionnaire.title || "Formulario", bold, 20, contentWidth),
    bold,
    20,
    margin,
    y,
  );
  if (questionnaire.description.trim()) {
    y -= 6;
    y = drawLines(
      page,
      wrapText(questionnaire.description, regular, 10, contentWidth),
      regular,
      10,
      margin,
      y,
      rgb(0.35, 0.39, 0.45),
    );
  }
  y -= 12;
  page.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    thickness: 1,
    color: rgb(0.82, 0.84, 0.88),
  });
  y -= 22;

  questionnaire.questions.forEach((question, questionIndex) => {
    const statementLines = wrapText(
      `${questionIndex + 1}. ${question.statement}`,
      bold,
      12,
      contentWidth,
    );
    const answerLines = question.answers.map((answer, answerIndex) => ({
      answer,
      label: String.fromCharCode(65 + answerIndex),
      lines: wrapText(answer.body, regular, 10.5, contentWidth - 30),
    }));
    const estimated =
      statementLines.length * 17 +
      answerLines.reduce((sum, item) => sum + Math.max(22, item.lines.length * 15), 0) +
      24;
    ensureSpace(Math.min(estimated, height - margin * 2));
    y = drawLines(page, statementLines, bold, 12, margin, y);
    y -= 7;
    const group = form.createRadioGroup(`pregunta_${questionIndex + 1}`);
    answerLines.forEach(({ answer, label, lines }) => {
      if (y - Math.max(22, lines.length * 15) < margin) newPage();
      group.addOptionToPage(`${label}_${answer.id.slice(-8)}`, page, {
        x: margin + 2,
        y: y - 11,
        width: 12,
        height: 12,
        borderWidth: 1,
        borderColor: rgb(0.35, 0.42, 0.52),
        backgroundColor: rgb(1, 1, 1),
      });
      page.drawText(`${label}.`, { x: margin + 20, y: y - 9, font: bold, size: 10.5 });
      y = drawLines(page, lines, regular, 10.5, margin + 38, y - 9);
      y -= 3;
    });
    y -= 12;
  });

  if (options.includeSolutions) {
    newPage();
    y = drawLines(page, ["Soluciones"], bold, 18, margin, y);
    y -= 10;
    questionnaire.questions.forEach((question, index) => {
      const correct = question.answers
        .map((answer, answerIndex) => ({ answer, label: String.fromCharCode(65 + answerIndex) }))
        .filter((item) => item.answer.isCorrect)
        .map((item) => `${item.label}. ${item.answer.body}`)
        .join(" / ");
      const lines = wrapText(
        `${index + 1}. ${correct || "Sin respuesta marcada"}`,
        regular,
        11,
        contentWidth,
      );
      const explanation = question.explanation.trim()
        ? wrapText(`Explicación: ${question.explanation}`, regular, 9.5, contentWidth - 12)
        : [];
      ensureSpace(lines.length * 16 + explanation.length * 14 + 12);
      y = drawLines(page, lines, bold, 11, margin, y, rgb(0.06, 0.48, 0.28));
      if (explanation.length)
        y = drawLines(page, explanation, regular, 9.5, margin + 12, y - 2, rgb(0.35, 0.39, 0.45));
      y -= 9;
    });
  }

  doc.setTitle(questionnaire.title || "Formulario");
  doc.setSubject("Formulario interactivo creado con PDF Maestro");
  doc.setCreator("PDF Maestro");
  doc.setProducer("PDF Maestro");
  form.updateFieldAppearances(regular);
  return doc.save({ useObjectStreams: false, addDefaultPage: false });
}
