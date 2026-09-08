import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConverterWorkspace } from "@/components/convert/ConverterWorkspace";

export const Route = createFileRoute("/convertir")({
  head: () => ({
    meta: [
      { title: "Convertir PDF a JPG, Word e imágenes — PDF Maestro" },
      {
        name: "description",
        content:
          "Convierte PDF a JPG, documentos Word e imágenes JPG o HEIC a PDF, sin subir tus documentos.",
      },
      { property: "og:title", content: "Conversores locales — PDF Maestro" },
      { property: "og:type", content: "website" },
    ],
  }),
  component: ConvertRoute,
});

function ConvertRoute() {
  return (
    <main className="flex min-h-svh flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center border-b border-border bg-card px-4">
        <Button asChild variant="ghost" size="sm">
          <Link to="/">
            <ArrowLeft className="mr-2 size-4" /> Volver al editor
          </Link>
        </Button>
      </header>
      <div className="min-h-0 flex-1">
        <ConverterWorkspace />
      </div>
    </main>
  );
}
