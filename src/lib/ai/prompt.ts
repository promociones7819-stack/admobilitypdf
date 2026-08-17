// Citation Layer + prompts — reglas anti-alucinación.
import type { AnswerMode, Citation, RetrievedChunk } from "./types";

export const GROUNDING_RULES = `Responde ÚNICAMENTE con la información del CONTEXTO recuperado de las fuentes del usuario.
Reglas estrictas:
- Si el contexto no contiene información suficiente, responde exactamente: "No encuentro esa información en las fuentes seleccionadas."
- No inventes datos, nombres de documentos, páginas ni citas.
- Cita las afirmaciones con marcadores [1], [2]… que correspondan a los fragmentos del contexto.
- Responde en el idioma de la pregunta, de forma clara y breve.`;

export const GENERAL_RULES = `Prioriza el CONTEXTO de las fuentes del usuario y cítalo con marcadores [1], [2]…
Puedes completar con conocimiento general, pero indica claramente cuándo una afirmación no proviene de las fuentes.
No inventes páginas ni nombres de documentos.`;

export const COMPARE_RULES = `Compara los fragmentos del CONTEXTO agrupándolos por documento.
Estructura la respuesta en: Coincidencias, Diferencias, Exclusivo de cada documento.
Cita siempre con marcadores [1], [2]… y no inventes información ausente del contexto.`;

export function systemPrompt(mode: AnswerMode): string {
  if (mode === "general") return GENERAL_RULES;
  if (mode === "compare") return COMPARE_RULES;
  return GROUNDING_RULES;
}

/** Las citas se construyen SIEMPRE con metadatos reales del índice. */
export function buildCitations(retrieved: RetrievedChunk[]): Citation[] {
  return retrieved.map((item, index) => ({
    index: index + 1,
    sourceId: item.chunk.sourceId,
    sourceName: item.chunk.sourceName,
    pageNumber: item.chunk.pageNumber,
    snippet: item.chunk.text.slice(0, 320),
  }));
}

export function buildContext(retrieved: RetrievedChunk[]): string {
  return retrieved
    .map(
      (item, index) =>
        `[${index + 1}] ${item.chunk.sourceName} — página ${item.chunk.pageNumber}\n${item.chunk.text}`,
    )
    .join("\n\n---\n\n");
}
