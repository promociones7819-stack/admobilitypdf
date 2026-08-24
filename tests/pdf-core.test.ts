import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument, PDFName } from "pdf-lib";
import { normalizeRotation } from "../src/lib/pdf/types.ts";
import { pageChunks, parsePageGroups, parsePageRange } from "../src/lib/pdf/ranges.ts";
import { normalizeConfig, safeExternalUrl, safeMediaSource } from "../src/lib/flipbook/hotspots.ts";
import {
  buildQuestionnaireHtml,
  buildQuestionnairePdf,
  parseQuestionnaireText,
} from "../src/lib/pdf/questionnaire.ts";

test("interpreta rangos de páginas y elimina duplicados", () => {
  assert.deepEqual(parsePageRange("1-3, 3, 6, 8-7", 8), [0, 1, 2, 5, 7, 6]);
  assert.throws(() => parsePageRange("1-12", 8), /range-outside/);
  assert.throws(() => parsePageRange("dos", 8), /invalid-range/);
});

test("divide páginas por grupos y por tamaño", () => {
  assert.deepEqual(parsePageGroups("1-2; 3,5; 4", 5), [[0, 1], [2, 4], [3]]);
  assert.deepEqual(pageChunks(7, 3), [[0, 1, 2], [3, 4, 5], [6]]);
});

test("normaliza rotaciones negativas y superiores a una vuelta", () => {
  assert.equal(normalizeRotation(-90), 270);
  assert.equal(normalizeRotation(450), 90);
});

test("rechaza esquemas inseguros en hipervínculos", () => {
  assert.equal(safeExternalUrl("javascript:alert(1)"), null);
  assert.equal(safeExternalUrl("ejemplo.com"), "https://ejemplo.com/");
});

test("descarta hotspots inválidos al importar configuración", () => {
  const result = normalizeConfig({
    version: 1,
    menuPage: -2,
    hotspots: [
      { page: 1, x: 2, y: 3, width: 20, height: 10, action: { type: "page", targetPage: 4 } },
      { page: 2, action: { type: "url", url: 23 } },
    ],
  });
  assert.equal(result.menuPage, 1);
  assert.equal(result.hotspots.length, 1);
  assert.equal(result.hotspots[0]?.action.type, "page");
});

test("conserva multimedia y estilos seguros del flipbook", () => {
  assert.equal(safeMediaSource("javascript:alert(1)", "video"), null);
  assert.equal(
    safeMediaSource("data:image/png;base64,AA==", "image")?.startsWith("data:image"),
    true,
  );
  const result = normalizeConfig({
    version: 1,
    menuPage: 2,
    theme: { background: "url(javascript:alert(1))", accent: "#0f766e", sound: true },
    hotspots: [
      {
        page: 1,
        x: 10,
        y: 20,
        width: 30,
        height: 40,
        style: { background: "#ffffff", animation: "pulse" },
        action: { type: "popup", title: "Ficha", text: "Contenido" },
      },
    ],
  });
  assert.equal(result.theme?.background, undefined);
  assert.equal(result.theme?.accent, "#0f766e");
  assert.equal(result.hotspots[0]?.style?.animation, "pulse");
});

test("detecta cuestionarios y crea campos PDF rellenables", async () => {
  const questions = parseQuestionnaireText(
    "1. Capital de Francia A) *París B) Roma 2. Dos más dos A) Tres B) *Cuatro",
  );
  assert.equal(questions.length, 2);
  assert.equal(questions[0]?.answers[0]?.isCorrect, true);
  const bytes = await buildQuestionnairePdf(
    {
      version: 1,
      title: "Prueba",
      description: "Selecciona una respuesta.",
      questions,
    },
    { autoCorrect: true },
  );
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getForm().getFields().length, 4);
  const button = pdf.getForm().getButton("corregir_formulario");
  assert.ok(button.acroField.getWidgets()[0]?.dict.get(PDFName.of("A")));
  assert.equal(pdf.getForm().getTextField("resultado_autocorreccion").isReadOnly(), true);
  assert.equal(pdf.getPageCount(), 1);
  const html = buildQuestionnaireHtml({
    version: 1,
    title: "</script><script>alert(1)</script>",
    description: "Prueba local",
    questions,
  });
  assert.match(html, /Corregir formulario/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
});
