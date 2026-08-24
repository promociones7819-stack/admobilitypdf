import { createFileRoute } from "@tanstack/react-router";
import { PdfEditorProvider, friendlyError, usePdfEditor } from "@/lib/pdf/store";
import { StartScreen } from "@/components/pdf/StartScreen";
import { Editor } from "@/components/pdf/Editor";
import { OpenFromAi } from "@/components/ai/OpenFromAi";
import { LargePdfDialog } from "@/components/pdf/LargePdfDialog";
import { FlipbookWorkspace } from "@/components/flipbook/FlipbookWorkspace";
import { BookOpen, Check, FileDown, PencilRuler } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ProjectBar } from "@/components/projects/ProjectBar";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Editor PDF — Edita, organiza y anota tus PDFs" },
      {
        name: "description",
        content:
          "Editor de PDF en el navegador: reordena, elimina, duplica y rota páginas, combina documentos y descarga un PDF real. Procesado local y privado.",
      },
      { property: "og:title", content: "Editor PDF — Edita, organiza y anota tus PDFs" },
      {
        property: "og:description",
        content:
          "Organiza páginas, combina PDFs y exporta un PDF válido sin salir de tu navegador.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Workspace() {
  const { hasDocument, exportFile, busy } = usePdfEditor();
  const [stage, setStage] = useState<"edit" | "flipbook">("edit");
  const [flipbookFile, setFlipbookFile] = useState<File | null>(null);
  const [openCompression, setOpenCompression] = useState(false);

  async function openFlipbook() {
    try {
      const file = await exportFile();
      setFlipbookFile(file);
      setStage("flipbook");
      toast.success("Edición aplicada: preparando el flipbook");
    } catch (error) {
      toast.error(friendlyError(error));
    }
  }
  return (
    <div className="flex h-screen flex-col bg-canvas">
      <ProjectBar />
      <OpenFromAi />
      <LargePdfDialog />
      {hasDocument && (
        <nav className="flex h-12 shrink-0 items-center justify-center border-b border-border bg-background px-3" aria-label="Proceso del documento">
          <div className="flex items-center gap-1 rounded-full border border-border bg-muted/40 p-1 text-xs sm:text-sm">
            <span className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-muted-foreground">
              <Check className="size-3.5 text-emerald-600" /> 1. Optimizar
            </span>
            <button className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 ${stage === "edit" ? "bg-background font-semibold shadow-sm" : "text-muted-foreground"}`} onClick={() => setStage("edit")}>
              <PencilRuler className="size-3.5" /> 2. Editar
            </button>
            <button className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 ${stage === "flipbook" ? "bg-background font-semibold shadow-sm" : "text-muted-foreground"}`} onClick={() => void openFlipbook()} disabled={busy}>
              <BookOpen className="size-3.5" /> 3. Flipbook
            </button>
            <span className="hidden items-center gap-1.5 px-3 py-1.5 text-muted-foreground sm:flex">
              <FileDown className="size-3.5" /> 4. Exportar
            </span>
          </div>
        </nav>
      )}
      <div className="min-h-0 flex-1">
        {!hasDocument ? (
          <StartScreen onRequestCompression={() => setOpenCompression(true)} />
        ) : stage === "edit" ? (
          <Editor
            onOpenFlipbook={() => void openFlipbook()}
            openCompression={openCompression}
            onCompressionOpened={() => setOpenCompression(false)}
          />
        ) : (
          <FlipbookWorkspace initialFile={flipbookFile} embedded />
        )}
      </div>
    </div>
  );
}


function Index() {
  return (
    <PdfEditorProvider>
      <Workspace />
    </PdfEditorProvider>
  );
}
