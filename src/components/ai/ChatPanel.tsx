import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowUpRight, Eraser, Loader2, Quote, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { requestOpen } from "@/lib/ai/handoff";
import { useAi } from "@/lib/ai/store";
import type { AnswerMode, Citation } from "@/lib/ai/types";

const MODES: Array<{ id: AnswerMode; label: string; hint: string }> = [
  { id: "sources-only", label: "Solo fuentes", hint: "Responde únicamente con tus documentos" },
  { id: "general", label: "Fuentes + general", hint: "Añade conocimiento general marcado" },
  { id: "compare", label: "Comparar", hint: "Contrasta varios documentos" },
];

const SUGGESTIONS = [
  "Resume las ideas principales",
  "¿Cuáles son las conclusiones?",
  "Extrae fechas y cifras clave",
  "Genera 5 preguntas de estudio",
];

function CitationChips({ citations }: { citations: Citation[] }) {
  const navigate = useNavigate();
  if (!citations.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {citations.map((citation) => (
        <button
          key={`${citation.sourceId}-${citation.index}`}
          type="button"
          title={citation.snippet}
          onClick={() => {
            requestOpen({
              sourceId: citation.sourceId,
              name: citation.sourceName,
              pageNumber: citation.pageNumber,
              ...(citation.snippet ? { snippet: citation.snippet } : {}),
            });
            void navigate({ to: "/" });
          }}
          className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-muted/60 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
        >
          <Quote className="size-3 shrink-0" />
          <span className="truncate">
            [{citation.index}] {citation.sourceName} · p. {citation.pageNumber}
          </span>
          <ArrowUpRight className="size-3 shrink-0" />
        </button>
      ))}
    </div>
  );
}

export function ChatPanel() {
  const { chat, ask, thinking, streaming, mode, setMode, resetChat, sources, activeNotebook } =
    useAi();
  const [value, setValue] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const readySources = useMemo(
    () => sources.filter((source) => source.status === "ready" && source.enabled),
    [sources],
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [chat.length, streaming]);

  async function send(question: string) {
    if (!question.trim() || thinking) return;
    setValue("");
    await ask(question);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <div className="flex flex-wrap gap-1">
          {MODES.map((item) => (
            <button
              key={item.id}
              type="button"
              title={item.hint}
              onClick={() => setMode(item.id)}
              className={cn(
                "rounded-full px-3 py-1 text-xs transition-colors",
                mode === item.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="ml-auto">
          <Button size="sm" variant="ghost" onClick={() => void resetChat()}>
            <Eraser className="mr-1 size-3.5" />
            Limpiar
          </Button>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
          {!chat.length && (
            <div className="rounded-xl border border-border bg-muted/30 p-6 text-center">
              <Sparkles className="mx-auto size-5 text-primary" />
              <h2 className="mt-3 text-base font-semibold">
                {activeNotebook ? activeNotebook.name : "Cuaderno de IA"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {readySources.length
                  ? "Pregunta lo que necesites: cada respuesta irá citada con documento y página."
                  : "Añade una fuente para empezar a preguntar."}
              </p>
              {readySources.length > 0 && (
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => void send(suggestion)}
                      className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:border-primary hover:text-foreground"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {chat.map((turn) => (
            <div
              key={turn.id}
              className={cn(
                "rounded-xl px-4 py-3 text-sm",
                turn.role === "user"
                  ? "ml-auto max-w-[85%] bg-primary text-primary-foreground"
                  : "mr-auto w-full border border-border bg-card",
              )}
            >
              <p className="whitespace-pre-wrap leading-relaxed">{turn.content}</p>
              {turn.role === "assistant" && <CitationChips citations={turn.citations} />}
            </div>
          ))}

          {(thinking || streaming) && (
            <div className="mr-auto w-full rounded-xl border border-border bg-card px-4 py-3 text-sm">
              {streaming ? (
                <p className="whitespace-pre-wrap leading-relaxed">{streaming}</p>
              ) : (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Buscando en tus fuentes…
                </p>
              )}
            </div>
          )}
          <div ref={endRef} />
        </div>
      </ScrollArea>

      <div className="border-t border-border p-3">
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <Textarea
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send(value);
              }
            }}
            rows={1}
            placeholder="Pregunta sobre tus documentos…"
            className="max-h-40 min-h-10 resize-none"
          />
          <Button
            size="icon"
            disabled={thinking || !value.trim()}
            onClick={() => void send(value)}
            aria-label="Enviar pregunta"
          >
            {thinking ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>
        </div>
        <p className="mx-auto mt-2 max-w-3xl text-[11px] text-muted-foreground">
          Todo se procesa en tu dispositivo. Las citas enlazan a la página exacta del PDF.
        </p>
      </div>
    </div>
  );
}
