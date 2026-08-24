import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OcrProcessor } from "@/components/ocr/OcrProcessor";

export const Route = createFileRoute("/ocr")({
  head: () => ({
    meta: [
      { title: "OCR de PDF en el navegador — Extrae texto de escaneados" },
      {
        name: "description",
        content:
          "Reconocimiento de texto (OCR) de PDFs escaneados en español o inglés, página a página, sin subir archivos: todo el proceso ocurre en tu navegador.",
      },
      { property: "og:title", content: "OCR local de PDF" },
      {
        property: "og:description",
        content: "Extrae, edita y descarga el texto de tus PDFs escaneados con OCR 100 % local.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: OcrRoute,
});

function OcrRoute() {
  return (
    <main className="min-h-svh bg-background px-4 py-8">
      <div className="mx-auto mb-6 flex w-full max-w-3xl items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">OCR de PDF</h1>
        <Button asChild variant="ghost" size="sm">
          <Link to="/">
            <ArrowLeft className="mr-2 size-4" /> Volver al editor
          </Link>
        </Button>
      </div>
      <OcrProcessor />
    </main>
  );
}
