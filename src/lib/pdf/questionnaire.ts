import {
  PDFDocument,
  PDFHexString,
  PDFName,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";

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
  options: { includeSolutions?: boolean; autoCorrect?: boolean } = {},
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const form = doc.getForm();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const width = 595.28;
  const height = 841.89;
  const margin = 48;
  const contentWidth = width - margin * 2;
  const correctValues: Record<string, string> = {};
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
    const fieldName = `pregunta_${questionIndex + 1}`;
    const group = form.createRadioGroup(fieldName);
    answerLines.forEach(({ answer, label, lines }) => {
      if (y - Math.max(22, lines.length * 15) < margin) newPage();
      const optionValue = `${label}_${answer.id.slice(-8)}`;
      if (answer.isCorrect) correctValues[fieldName] = optionValue;
      group.addOptionToPage(optionValue, page, {
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

  if (options.autoCorrect) {
    ensureSpace(92);
    page.drawLine({
      start: { x: margin, y: y + 5 },
      end: { x: width - margin, y: y + 5 },
      thickness: 1,
      color: rgb(0.82, 0.84, 0.88),
    });
    y -= 18;
    const result = form.createTextField("resultado_autocorreccion");
    result.enableReadOnly();
    result.setText("Pulsa “Corregir formulario” para ver tu puntuación.");
    result.addToPage(page, {
      x: margin,
      y: y - 28,
      width: contentWidth - 154,
      height: 30,
      borderWidth: 1,
      borderColor: rgb(0.75, 0.78, 0.83),
      backgroundColor: rgb(0.97, 0.98, 1),
      textColor: rgb(0.12, 0.16, 0.22),
      font: regular,
    });
    result.setFontSize(10);
    const button = form.createButton("corregir_formulario");
    button.addToPage("Corregir formulario", page, {
      x: width - margin - 140,
      y: y - 28,
      width: 140,
      height: 30,
      borderWidth: 1,
      borderColor: rgb(0.07, 0.42, 0.34),
      backgroundColor: rgb(0.08, 0.56, 0.44),
      textColor: rgb(1, 1, 1),
      font: bold,
    });
    const script = `
(function () {
  var correctas = ${JSON.stringify(correctValues)};
  var total = ${questionnaire.questions.length};
  var respondidas = 0;
  var aciertos = 0;
  for (var nombre in correctas) {
    var campo = this.getField(nombre);
    if (campo && campo.value !== "Off") {
      respondidas += 1;
      if (campo.value === correctas[nombre]) aciertos += 1;
    }
  }
  var porcentaje = total ? Math.round((aciertos * 100) / total) : 0;
  var mensaje = "Resultado: " + aciertos + " / " + total + " (" + porcentaje + "%). Respondidas: " + respondidas + ".";
  var resultado = this.getField("resultado_autocorreccion");
  if (resultado) resultado.value = mensaje;
  app.alert({ cMsg: mensaje, cTitle: "Autocorrección", nIcon: 3 });
}).call(this);`;
    const action = doc.context.obj({
      S: PDFName.of("JavaScript"),
      JS: PDFHexString.fromText(script),
    });
    const actionRef = doc.context.register(action);
    button.acroField.getWidgets().forEach((widget) => {
      widget.dict.set(PDFName.of("A"), actionRef);
    });
    y -= 48;
  }

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

/** Alternativa universal para lectores PDF que bloquean JavaScript (Safari, Chrome y Vista Previa). */
export function buildQuestionnaireHtml(questionnaire: QuestionnaireDocument): string {
  const data = JSON.stringify(questionnaire)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Formulario autocorregible — PDF Maestro</title>
<style>
:root{font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#27221f;background:#fff4ef}*{box-sizing:border-box}body{margin:0;background:linear-gradient(135deg,#fff1e8,#f5edff);min-height:100vh}.shell{width:min(900px,calc(100% - 28px));margin:30px auto 70px}.hero,.question,.result{background:#fffdfb;border:1px solid #eadfd9;border-radius:24px;box-shadow:0 14px 36px #6b4d3b18}.hero{padding:28px;margin-bottom:20px}.brand{color:#de604a;font-weight:800;letter-spacing:.08em;text-transform:uppercase;font-size:12px}.hero h1{margin:8px 0;font-size:clamp(28px,5vw,44px)}.hero p{color:#71655e;white-space:pre-wrap}.question{padding:24px;margin:16px 0}.question h2{font-size:18px;margin:0 0 16px}.option{display:flex;gap:12px;align-items:flex-start;border:1px solid #eadfd9;border-radius:16px;padding:13px;margin:9px 0;cursor:pointer;background:#fff}.option:hover{border-color:#e88270}.option.correct{border-color:#2e9f73;background:#eefbf5}.option.wrong{border-color:#d85858;background:#fff1f1}.explanation{display:none;margin-top:14px;padding:13px;border-radius:14px;background:#f7f3ff;color:#665d72}.question.checked .explanation{display:block}.actions{position:sticky;bottom:14px;display:flex;gap:12px;align-items:center;justify-content:space-between;padding:14px 18px;background:#fffdfbea;border:1px solid #eadfd9;border-radius:18px;backdrop-filter:blur(12px);box-shadow:0 12px 32px #51322526}.actions button{border:0;border-radius:14px;padding:13px 20px;background:#e9644e;color:#fff;font-size:16px;font-weight:750;cursor:pointer}.result{display:none;padding:18px;margin-top:18px;font-size:18px;font-weight:750}.result.show{display:block}@media(max-width:600px){.shell{margin-top:14px}.hero,.question{padding:18px}.actions{align-items:stretch;flex-direction:column}.actions button{width:100%}}
</style>
</head>
<body>
<main class="shell"><section class="hero"><div class="brand">PDF Maestro</div><h1 id="title"></h1><p id="description"></p></section><div id="questions"></div><section id="result" class="result" role="status"></section><div class="actions"><span id="progress">0 respondidas</span><button id="correct" type="button">Corregir formulario</button></div></main>
<script id="questionnaire" type="application/json">${data}</script>
<script>
(function(){
  var data=JSON.parse(document.getElementById("questionnaire").textContent);
  var host=document.getElementById("questions");
  document.getElementById("title").textContent=data.title||"Formulario";
  document.getElementById("description").textContent=data.description||"Selecciona una respuesta en cada pregunta.";
  data.questions.forEach(function(q,qi){
    var card=document.createElement("section");card.className="question";card.dataset.index=String(qi);
    var heading=document.createElement("h2");heading.textContent=(qi+1)+". "+q.statement;card.appendChild(heading);
    q.answers.forEach(function(a,ai){
      var label=document.createElement("label");label.className="option";label.dataset.correct=String(Boolean(a.isCorrect));
      var input=document.createElement("input");input.type="radio";input.name="question_"+qi;input.value=a.id;
      input.addEventListener("change",updateProgress);var text=document.createElement("span");text.textContent=String.fromCharCode(65+ai)+". "+a.body;
      label.appendChild(input);label.appendChild(text);card.appendChild(label);
    });
    if(q.explanation){var explanation=document.createElement("div");explanation.className="explanation";explanation.textContent="Explicación: "+q.explanation;card.appendChild(explanation);}
    host.appendChild(card);
  });
  function updateProgress(){var answered=document.querySelectorAll('input[type="radio"]:checked').length;document.getElementById("progress").textContent=answered+" de "+data.questions.length+" respondidas";}
  document.getElementById("correct").addEventListener("click",function(){
    var score=0;document.querySelectorAll(".question").forEach(function(card){
      card.classList.add("checked");var selected=card.querySelector('input[type="radio"]:checked');
      card.querySelectorAll(".option").forEach(function(label){label.classList.remove("correct","wrong");if(label.dataset.correct==="true")label.classList.add("correct");if(selected&&label.contains(selected)&&label.dataset.correct!=="true")label.classList.add("wrong");});
      if(selected&&selected.closest(".option").dataset.correct==="true")score+=1;
    });
    var percent=data.questions.length?Math.round(score*100/data.questions.length):0;var result=document.getElementById("result");result.textContent="Resultado: "+score+" / "+data.questions.length+" ("+percent+"%)";result.classList.add("show");result.scrollIntoView({behavior:"smooth",block:"center"});
  });
})();
</script>
</body>
</html>`;
}
