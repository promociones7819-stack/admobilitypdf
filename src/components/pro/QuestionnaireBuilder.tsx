import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Download,
  FileJson,
  Globe2,
  Loader2,
  Plus,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveBlob } from "@/lib/download";
import { extractPdfText } from "@/lib/pdf/pro";
import {
  buildQuestionnairePdf,
  buildQuestionnaireHtml,
  createQuestion,
  parseQuestionnaireText,
  questionnaireId,
  type QuestionnaireAnswer,
  type QuestionnaireDocument,
  type QuestionnaireQuestion,
} from "@/lib/pdf/questionnaire";

type CreatedHandler = (file: File) => Promise<void> | void;

const STORAGE_KEY = "pdf-maestro:questionnaire-builder:v1";

const initialDocument: QuestionnaireDocument = {
  version: 1,
  title: "Nuevo formulario",
  description: "",
  questions: [createQuestion(1)],
};

function safeName(value: string): string {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9-_ ]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 80) || "formulario"
  );
}

function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length || from === to) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  if (item !== undefined) next.splice(to, 0, item);
  return next;
}

function normalizeImported(value: unknown): QuestionnaireDocument | null {
  const data = value as Partial<QuestionnaireDocument>;
  if (!data || !Array.isArray(data.questions)) return null;
  const questions = data.questions
    .map((raw, index): QuestionnaireQuestion | null => {
      const question = raw as Partial<QuestionnaireQuestion>;
      if (typeof question.statement !== "string" || !Array.isArray(question.answers)) return null;
      const answers = question.answers
        .map((rawAnswer, answerIndex): QuestionnaireAnswer | null => {
          const answer = rawAnswer as Partial<QuestionnaireAnswer>;
          if (typeof answer.body !== "string") return null;
          return {
            id: typeof answer.id === "string" ? answer.id : questionnaireId("answer"),
            body: answer.body || `Opción ${answerIndex + 1}`,
            isCorrect: answer.isCorrect === true,
          };
        })
        .filter((answer): answer is QuestionnaireAnswer => Boolean(answer));
      if (answers.length < 2) return null;
      if (!answers.some((answer) => answer.isCorrect)) answers[0]!.isCorrect = true;
      return {
        id: typeof question.id === "string" ? question.id : questionnaireId("question"),
        statement: question.statement || `Pregunta ${index + 1}`,
        explanation: typeof question.explanation === "string" ? question.explanation : "",
        answers,
      };
    })
    .filter((question): question is QuestionnaireQuestion => Boolean(question));
  if (!questions.length) return null;
  return {
    version: 1,
    title: typeof data.title === "string" ? data.title : "Formulario",
    description: typeof data.description === "string" ? data.description : "",
    questions,
  };
}

export function QuestionnaireBuilder({
  onPdfCreated,
}: {
  onPdfCreated?: CreatedHandler | undefined;
}) {
  const [document, setDocument] = useState<QuestionnaireDocument>(() => {
    if (typeof localStorage === "undefined") return initialDocument;
    try {
      return (
        normalizeImported(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null")) ??
        initialDocument
      );
    } catch {
      return initialDocument;
    }
  });
  const [includeSolutions, setIncludeSolutions] = useState(false);
  const [autoCorrect, setAutoCorrect] = useState(true);
  const [busy, setBusy] = useState(false);
  const pdfRef = useRef<HTMLInputElement>(null);
  const jsonRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(
      () => localStorage.setItem(STORAGE_KEY, JSON.stringify(document)),
      250,
    );
    return () => window.clearTimeout(timer);
  }, [document]);

  const updateQuestion = (id: string, patch: Partial<QuestionnaireQuestion>) => {
    setDocument((current) => ({
      ...current,
      questions: current.questions.map((question) =>
        question.id === id ? { ...question, ...patch } : question,
      ),
    }));
  };

  const updateAnswers = (questionId: string, answers: QuestionnaireAnswer[]) =>
    updateQuestion(questionId, { answers });

  const addQuestion = () => {
    setDocument((current) => ({
      ...current,
      questions: [...current.questions, createQuestion(current.questions.length + 1)],
    }));
  };

  const removeQuestion = (id: string) => {
    setDocument((current) => ({
      ...current,
      questions: current.questions.filter((question) => question.id !== id),
    }));
  };

  const moveQuestion = (index: number, delta: number) => {
    setDocument((current) => ({
      ...current,
      questions: moveItem(current.questions, index, index + delta),
    }));
  };

  const importPdf = async (file: File) => {
    setBusy(true);
    try {
      const pages = await extractPdfText(new Uint8Array(await file.arrayBuffer()));
      const questions = parseQuestionnaireText(
        pages.map((page) => `--- Página ${page.page} ---\n${page.text}`).join("\n"),
      );
      if (!questions.length) {
        toast.error("No se han detectado preguntas con dos o más opciones.");
        return;
      }
      setDocument({
        version: 1,
        title: file.name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " "),
        description: `Importado de ${file.name}. Revisa las preguntas antes de exportar.`,
        questions,
      });
      toast.success(`${questions.length} preguntas importadas del PDF`);
    } catch (error) {
      console.error(error);
      toast.error("No se ha podido leer el cuestionario del PDF.");
    } finally {
      setBusy(false);
    }
  };

  const importJson = async (file: File) => {
    try {
      const imported = normalizeImported(JSON.parse(await file.text()));
      if (!imported) throw new Error("invalid-questionnaire");
      setDocument(imported);
      toast.success("Formulario restaurado");
    } catch {
      toast.error("El archivo no contiene un formulario válido.");
    }
  };

  const exportJson = async () => {
    await saveBlob(
      new Blob([JSON.stringify(document, null, 2)], { type: "application/json" }),
      `${safeName(document.title)}.formulario.json`,
    );
    toast.success("Copia editable guardada");
  };

  const exportPdf = async () => {
    if (!document.title.trim() || !document.questions.length) {
      toast.error("Añade un título y al menos una pregunta.");
      return;
    }
    if (document.questions.some((question) => question.answers.length < 2)) {
      toast.error("Cada pregunta necesita al menos dos opciones.");
      return;
    }
    if (
      autoCorrect &&
      document.questions.some((question) => !question.answers.some((answer) => answer.isCorrect))
    ) {
      toast.error("Marca una respuesta correcta en cada pregunta.");
      return;
    }
    setBusy(true);
    try {
      const bytes = await buildQuestionnairePdf(document, { includeSolutions, autoCorrect });
      const file = new File(
        [bytes.slice(0) as unknown as BlobPart],
        `${safeName(document.title)}.pdf`,
        {
          type: "application/pdf",
        },
      );
      if (onPdfCreated) await onPdfCreated(file);
      else await saveBlob(file, file.name);
      toast.success("Formulario PDF rellenable creado");
    } catch (error) {
      console.error(error);
      toast.error("No se ha podido crear el formulario PDF.");
    } finally {
      setBusy(false);
    }
  };

  const exportHtml = async () => {
    if (!document.title.trim() || !document.questions.length) {
      toast.error("Añade un título y al menos una pregunta.");
      return;
    }
    await saveBlob(
      new Blob([buildQuestionnaireHtml(document)], { type: "text/html;charset=utf-8" }),
      `${safeName(document.title)}-autocorregible.html`,
    );
    toast.success("Formulario HTML autocorregible creado");
  };

  return (
    <section className="space-y-6">
      <div className="overflow-hidden rounded-[28px] border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4 sm:px-7">
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              Borrador local
            </span>
            <span className="text-xs text-muted-foreground">
              {document.questions.length}{" "}
              {document.questions.length === 1 ? "pregunta" : "preguntas"}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => pdfRef.current?.click()}
              disabled={busy}
            >
              <Upload className="mr-2 size-4" /> Importar PDF
            </Button>
            <Button variant="outline" size="sm" onClick={() => jsonRef.current?.click()}>
              <FileJson className="mr-2 size-4" /> Abrir copia
            </Button>
            <Button variant="outline" size="sm" onClick={() => void exportJson()}>
              <Save className="mr-2 size-4" /> Guardar copia
            </Button>
          </div>
          <input
            ref={pdfRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void importPdf(file);
            }}
          />
          <input
            ref={jsonRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void importJson(file);
            }}
          />
        </div>
        <div className="grid gap-5 px-5 py-6 sm:px-7">
          <div>
            <Label className="mb-2 block text-xs uppercase tracking-wider text-muted-foreground">
              Título
            </Label>
            <Input
              value={document.title}
              onChange={(event) =>
                setDocument((current) => ({ ...current, title: event.target.value }))
              }
              className="text-lg font-semibold"
              placeholder="Título del formulario"
            />
          </div>
          <div>
            <Label className="mb-2 block text-xs uppercase tracking-wider text-muted-foreground">
              Descripción e instrucciones
            </Label>
            <Textarea
              value={document.description}
              onChange={(event) =>
                setDocument((current) => ({ ...current, description: event.target.value }))
              }
              rows={3}
              placeholder="Explica cómo debe rellenarse el formulario"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Preguntas</h2>
          <p className="text-sm text-muted-foreground">
            Edita cada bloque, ordena sus opciones y marca la respuesta correcta.
          </p>
        </div>
        <Button onClick={addQuestion}>
          <Plus className="mr-2 size-4" /> Añadir pregunta
        </Button>
      </div>

      <div className="rounded-2xl border bg-muted/35 p-4 text-sm text-muted-foreground">
        Los cambios se guardan automáticamente en este navegador. También puedes guardar una copia
        JSON para continuar en otro equipo.
      </div>

      <div className="space-y-4">
        {document.questions.map((question, questionIndex) => (
          <QuestionCard
            key={question.id}
            question={question}
            index={questionIndex}
            total={document.questions.length}
            onChange={(patch) => updateQuestion(question.id, patch)}
            onAnswers={(answers) => updateAnswers(question.id, answers)}
            onMove={(delta) => moveQuestion(questionIndex, delta)}
            onRemove={() => removeQuestion(question.id)}
          />
        ))}
        {!document.questions.length && (
          <div className="rounded-[28px] border bg-card p-8 text-center text-muted-foreground">
            Aún no hay preguntas. Pulsa “Añadir pregunta” para comenzar.
          </div>
        )}
      </div>

      <div className="sticky bottom-3 flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-background/95 p-4 shadow-lg backdrop-blur">
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium">
            <Checkbox
              checked={autoCorrect}
              onCheckedChange={(value) => setAutoCorrect(value === true)}
            />
            Formulario autocorregible
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={includeSolutions}
              onCheckedChange={(value) => setIncludeSolutions(value === true)}
            />
            Añadir soluciones y explicaciones al final
          </label>
          {autoCorrect && (
            <p className="max-w-xl text-xs text-muted-foreground">
              El botón de corrección funciona en Adobe Acrobat Reader y otros lectores que permiten
              JavaScript. Vista Previa de macOS y algunos navegadores pueden bloquearlo.
            </p>
          )}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {autoCorrect && (
            <Button variant="outline" onClick={() => void exportHtml()} disabled={busy}>
              <Globe2 className="mr-2 size-4" /> HTML autocorregible
            </Button>
          )}
          <Button onClick={() => void exportPdf()} disabled={busy || !document.questions.length}>
            {busy ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Download className="mr-2 size-4" />
            )}
            Crear formulario PDF rellenable
          </Button>
        </div>
      </div>
    </section>
  );
}

function QuestionCard({
  question,
  index,
  total,
  onChange,
  onAnswers,
  onMove,
  onRemove,
}: {
  question: QuestionnaireQuestion;
  index: number;
  total: number;
  onChange: (patch: Partial<QuestionnaireQuestion>) => void;
  onAnswers: (answers: QuestionnaireAnswer[]) => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
}) {
  const moveAnswer = (answerIndex: number, delta: number) =>
    onAnswers(moveItem(question.answers, answerIndex, answerIndex + delta));

  const updateAnswer = (id: string, patch: Partial<QuestionnaireAnswer>) =>
    onAnswers(
      question.answers.map((answer) => (answer.id === id ? { ...answer, ...patch } : answer)),
    );

  const markCorrect = (id: string) =>
    onAnswers(question.answers.map((answer) => ({ ...answer, isCorrect: answer.id === id })));

  const addAnswer = () =>
    onAnswers([
      ...question.answers,
      {
        id: questionnaireId("answer"),
        body: `Opción ${question.answers.length + 1}`,
        isCorrect: false,
      },
    ]);

  const removeAnswer = (id: string) => {
    if (question.answers.length <= 2) {
      toast.error("Cada pregunta necesita al menos dos opciones.");
      return;
    }
    const next = question.answers.filter((answer) => answer.id !== id);
    if (!next.some((answer) => answer.isCorrect)) next[0]!.isCorrect = true;
    onAnswers(next);
  };

  return (
    <article className="rounded-[28px] border bg-card p-5 shadow-sm sm:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 min-w-9 items-center justify-center rounded-full bg-primary/10 px-3 text-sm font-semibold text-primary">
            {index + 1}
          </span>
          <span className="text-xs uppercase tracking-widest text-muted-foreground">Pregunta</span>
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="outline" disabled={index === 0} onClick={() => onMove(-1)}>
            <ArrowUp className="size-4" />
            <span className="sr-only">Subir pregunta</span>
          </Button>
          <Button
            size="icon"
            variant="outline"
            disabled={index === total - 1}
            onClick={() => onMove(1)}
          >
            <ArrowDown className="size-4" />
            <span className="sr-only">Bajar pregunta</span>
          </Button>
          <Button size="icon" variant="ghost" onClick={onRemove} className="text-destructive">
            <Trash2 className="size-4" />
            <span className="sr-only">Eliminar pregunta</span>
          </Button>
        </div>
      </div>

      <Textarea
        value={question.statement}
        onChange={(event) => onChange({ statement: event.target.value })}
        rows={2}
        className="min-h-20 text-base font-medium"
        placeholder="Escribe la pregunta"
      />

      <div className="mt-6 space-y-3">
        {question.answers.map((answer, answerIndex) => (
          <div
            key={answer.id}
            className={`flex flex-wrap items-center gap-3 rounded-2xl border p-3 transition sm:flex-nowrap ${
              answer.isCorrect ? "border-emerald-500/50 bg-emerald-500/5" : "bg-background/40"
            }`}
          >
            <button
              type="button"
              onClick={() => markCorrect(answer.id)}
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition ${
                answer.isCorrect
                  ? "border-emerald-500 bg-emerald-500 text-white"
                  : "bg-background text-muted-foreground hover:border-primary hover:text-primary"
              }`}
              aria-label={`Marcar ${String.fromCharCode(65 + answerIndex)} como correcta`}
            >
              {answer.isCorrect ? (
                <Check className="size-4" />
              ) : (
                String.fromCharCode(65 + answerIndex)
              )}
            </button>
            <Input
              value={answer.body}
              onChange={(event) => updateAnswer(answer.id, { body: event.target.value })}
              className="min-w-48 flex-1 border-0 bg-transparent shadow-none"
            />
            <div className="ml-auto flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                disabled={answerIndex === 0}
                onClick={() => moveAnswer(answerIndex, -1)}
              >
                <ArrowUp className="size-4" />
                <span className="sr-only">Subir opción</span>
              </Button>
              <Button
                size="icon"
                variant="ghost"
                disabled={answerIndex === question.answers.length - 1}
                onClick={() => moveAnswer(answerIndex, 1)}
              >
                <ArrowDown className="size-4" />
                <span className="sr-only">Bajar opción</span>
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => removeAnswer(answer.id)}
              >
                <Trash2 className="size-4" />
                <span className="sr-only">Eliminar opción</span>
              </Button>
            </div>
          </div>
        ))}
        <Button variant="ghost" size="sm" onClick={addAnswer}>
          <Plus className="mr-2 size-4" /> Añadir opción
        </Button>
      </div>

      <div className="mt-6 rounded-2xl border bg-muted/25 p-4">
        <Label className="mb-2 block text-xs uppercase tracking-wider text-muted-foreground">
          Explicación de la respuesta
        </Label>
        <Textarea
          value={question.explanation}
          onChange={(event) => onChange({ explanation: event.target.value })}
          rows={2}
          placeholder="Opcional: se incluirá en la página de soluciones"
        />
      </div>
    </article>
  );
}
