import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, FileText, LibraryBig, Settings2, Sparkles } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ChatPanel } from "@/components/ai/ChatPanel";
import { EnginePanel } from "@/components/ai/EnginePanel";
import { NotebookList } from "@/components/ai/NotebookList";
import { SourcesPanel } from "@/components/ai/SourcesPanel";
import { AiProvider } from "@/lib/ai/store";

export const Route = createFileRoute("/ia")({
  head: () => ({
    meta: [
      { title: "IA Documentos — Pregunta a tus PDFs sin salir del navegador" },
      {
        name: "description",
        content:
          "Asistente de documentos local tipo NotebookLM: sube PDFs, pregunta y obtén respuestas citadas con documento y página. Sin servidores ni telemetría.",
      },
      { property: "og:title", content: "IA Documentos — Pregunta a tus PDFs en local" },
      {
        property: "og:description",
        content:
          "RAG 100 % en el navegador: embeddings, búsqueda semántica y respuestas citadas sobre tus propios documentos.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AiRoute,
});

function AiRoute() {
  return (
    <AiProvider>
      <AiWorkspace />
    </AiProvider>
  );
}

export function AiWorkspace({
  embedded = false,
  onBack,
}: {
  embedded?: boolean;
  onBack?: () => void;
}) {
  const [engineOpen, setEngineOpen] = useState(false);
  const [notebooksOpen, setNotebooksOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);

  return (
    <div className={`flex flex-col bg-background ${embedded ? "h-full" : "h-screen"}`}>
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
        <Sparkles className="size-5 text-primary" />
        <h1 className="text-sm font-semibold tracking-tight">IA Documentos</h1>
        <span className="hidden rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground sm:inline">
          Procesamiento local
        </span>
        <div className="ml-auto flex items-center gap-2">
          {onBack ? (
            <Button size="sm" variant="ghost" onClick={onBack}>
              <FileText className="mr-1 size-4" />
              Editor PDF
            </Button>
          ) : (
            <Button asChild size="sm" variant="ghost">
              <Link to="/">
                <FileText className="mr-1 size-4" />
                Editor PDF
              </Link>
            </Button>
          )}
          <Sheet open={notebooksOpen} onOpenChange={setNotebooksOpen}>
            <SheetTrigger asChild>
              <Button size="icon" variant="ghost" className="lg:hidden" aria-label="Cuadernos">
                <BookOpen className="size-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="flex w-[20rem] flex-col p-4">
              <SheetTitle className="mb-4 text-sm">Cuadernos</SheetTitle>
              <div className="min-h-0 flex-1">
                <NotebookList />
              </div>
            </SheetContent>
          </Sheet>
          <Sheet open={sourcesOpen} onOpenChange={setSourcesOpen}>
            <SheetTrigger asChild>
              <Button size="icon" variant="ghost" className="xl:hidden" aria-label="Fuentes">
                <LibraryBig className="size-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="flex w-[22rem] flex-col p-4">
              <SheetTitle className="mb-4 text-sm">Fuentes</SheetTitle>
              <div className="min-h-0 flex-1">
                <SourcesPanel />
              </div>
            </SheetContent>
          </Sheet>
          <Sheet open={engineOpen} onOpenChange={setEngineOpen}>
            <SheetTrigger asChild>
              <Button size="sm" variant="secondary">
                <Settings2 className="mr-1 size-4" />
                Motor
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[22rem] overflow-y-auto p-4">
              <SheetTitle className="mb-4 text-sm">Motor de IA local</SheetTitle>
              <EnginePanel />
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-64 shrink-0 flex-col gap-4 border-r border-border p-3 lg:flex">
          <section className="flex min-h-0 flex-1 flex-col">
            <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Cuadernos
            </h2>
            <NotebookList />
          </section>
        </aside>

        <main className="flex min-w-0 flex-1">
          <div className="min-w-0 flex-1">
            <ChatPanel />
          </div>
          <aside className="hidden w-72 shrink-0 border-l border-border p-3 xl:block">
            <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Fuentes
            </h2>
            <div className="h-[calc(100%_-_1.75rem)]">
              <SourcesPanel />
            </div>
          </aside>
        </main>
      </div>
    </div>
  );
}
