import { createFileRoute } from "@tanstack/react-router";
import { PdfEditorProvider, friendlyError, usePdfEditor } from "@/lib/pdf/store";
import { StartScreen } from "@/components/pdf/StartScreen";
import { Editor } from "@/components/pdf/Editor";
import { OpenFromAi } from "@/components/ai/OpenFromAi";
import { LargePdfDialog } from "@/components/pdf/LargePdfDialog";
import { ArrowLeft, BookOpen, Loader2, Minimize2, PencilRuler } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { toast } from "sonner";
import { ProjectBar } from "@/components/projects/ProjectBar";
import { Button } from "@/components/ui/button";

const FlipbookWorkspace = lazy(() =>
  import("@/components/flipbook/FlipbookWorkspace").then((module) => ({
    default: module.FlipbookWorkspace,
  })),
);
const ConverterWorkspace = lazy(() =>
  import("@/components/convert/ConverterWorkspace").then((module) => ({
    default: module.ConverterWorkspace,
  })),
);
const OcrProcessor = lazy(() =>
  import("@/components/ocr/OcrProcessor").then((module) => ({ default: module.OcrProcessor })),
);
const AiEmbeddedWorkspace = lazy(() => import("@/components/ai/AiEmbeddedWorkspace"));
const ProfessionalToolsWorkspace = lazy(() =>
  import("@/components/pro/ProfessionalToolsWorkspace").then((module) => ({
    default: module.ProfessionalToolsWorkspace,
  })),
);

type WorkspaceStage = "edit" | "flipbook" | "convert" | "ocr" | "ai" | "pro";

function ToolHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-4">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft className="mr-2 size-4" /> Volver al editor
      </Button>
      <span className="hidden text-sm font-semibold sm:inline">{title}</span>
    </header>
  );
}

function LoadingTool() {
  return (
    <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="size-5 animate-spin text-primary" /> Preparando herramienta…
    </div>
  );
}

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
  const { hasDocument, exportFile, openFiles, busy } = usePdfEditor();
  const [stage, setStage] = useState<WorkspaceStage>("edit");
  const [flipbookFile, setFlipbookFile] = useState<File | null>(null);
  const [ocrFile, setOcrFile] = useState<File | null>(null);
  const [openCompression, setOpenCompression] = useState(false);

  async function openFlipbook() {
    if (!hasDocument) {
      setFlipbookFile(null);
      setStage("flipbook");
      return;
    }
    try {
      const file = await exportFile();
      setFlipbookFile(file);
      setStage("flipbook");
      toast.success("Edición aplicada: preparando el flipbook");
    } catch (error) {
      toast.error(friendlyError(error));
    }
  }

  async function openTool(tool: "convert" | "ocr" | "ai" | "pro") {
    if (tool === "ocr" && hasDocument) {
      try {
        setOcrFile(await exportFile());
      } catch (error) {
        toast.error(friendlyError(error));
        return;
      }
    } else if (tool === "ocr") {
      setOcrFile(null);
    }
    setStage(tool);
  }

  async function openCreatedPdf(file: File) {
    await openFiles([file]);
    setStage("edit");
  }

  const backToEditor = () => setStage("edit");
  return (
    <div className="flex h-screen flex-col bg-canvas">
      <ProjectBar />
      <OpenFromAi onDocumentOpened={() => setStage("edit")} />
      <LargePdfDialog />
      {hasDocument && (stage === "edit" || stage === "flipbook") && (
        <nav
          className="flex h-12 shrink-0 items-center justify-center border-b border-border bg-background px-3"
          aria-label="Proceso del documento"
        >
          <div className="flex items-center gap-1 rounded-full border border-border bg-muted/40 p-1 text-xs sm:text-sm">
            <button
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-muted-foreground hover:bg-background hover:text-foreground"
              onClick={() => {
                setStage("edit");
                setOpenCompression(true);
              }}
            >
              <Minimize2 className="size-3.5" /> 1. Reducir PDF
            </button>
            <button
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 ${stage === "edit" ? "bg-background font-semibold shadow-sm" : "text-muted-foreground"}`}
              onClick={() => setStage("edit")}
            >
              <PencilRuler className="size-3.5" /> 2. Editar
            </button>
            <button
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 ${stage === "flipbook" ? "bg-background font-semibold shadow-sm" : "text-muted-foreground"}`}
              onClick={() => void openFlipbook()}
              disabled={busy}
            >
              <BookOpen className="size-3.5" /> 3. Flipbook
            </button>
          </div>
        </nav>
      )}
      <div className="min-h-0 flex-1">
        <Suspense fallback={<LoadingTool />}>
          {stage === "convert" ? (
            <div className="flex h-full flex-col">
              <ToolHeader title="Conversores" onBack={backToEditor} />
              <div className="min-h-0 flex-1">
                <ConverterWorkspace onPdfCreated={openCreatedPdf} />
              </div>
            </div>
          ) : stage === "ocr" ? (
            <div className="flex h-full flex-col bg-background">
              <ToolHeader title="OCR" onBack={backToEditor} />
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-8">
                <OcrProcessor initialFile={ocrFile} onPdfCreated={openCreatedPdf} />
              </div>
            </div>
          ) : stage === "ai" ? (
            <AiEmbeddedWorkspace onBack={backToEditor} />
          ) : stage === "pro" ? (
            <div className="flex h-full flex-col bg-background">
              <ToolHeader title="Herramientas profesionales" onBack={backToEditor} />
              <div className="min-h-0 flex-1">
                <ProfessionalToolsWorkspace onPdfCreated={openCreatedPdf} />
              </div>
            </div>
          ) : !hasDocument ? (
            stage === "flipbook" ? (
              <div className="flex h-full flex-col bg-background">
                <ToolHeader title="Flipbook" onBack={backToEditor} />
                <div className="min-h-0 flex-1">
                  <FlipbookWorkspace />
                </div>
              </div>
            ) : (
              <StartScreen
                onRequestCompression={() => setOpenCompression(true)}
                onOpenTool={(tool) => {
                  if (tool === "flipbook") void openFlipbook();
                  else void openTool(tool);
                }}
              />
            )
          ) : stage === "edit" ? (
            <Editor
              onOpenFlipbook={() => void openFlipbook()}
              openCompression={openCompression}
              onCompressionOpened={() => setOpenCompression(false)}
              onOpenTool={(tool) => void openTool(tool)}
            />
          ) : (
            <FlipbookWorkspace initialFile={flipbookFile} embedded />
          )}
        </Suspense>
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
