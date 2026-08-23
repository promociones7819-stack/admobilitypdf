import { createFileRoute } from "@tanstack/react-router";
import { PdfEditorProvider, usePdfEditor } from "@/lib/pdf/store";
import { StartScreen } from "@/components/pdf/StartScreen";
import { Editor } from "@/components/pdf/Editor";
import { OpenFromAi } from "@/components/ai/OpenFromAi";

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
  const { hasDocument } = usePdfEditor();
  return (
    <>
      <OpenFromAi />
      <LargePdfDialog />
      {hasDocument ? <Editor /> : <StartScreen />}
    </>
  );
}


function Index() {
  return (
    <PdfEditorProvider>
      <Workspace />
    </PdfEditorProvider>
  );
}
