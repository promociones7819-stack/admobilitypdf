import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FlipbookWorkspace } from "@/components/flipbook/FlipbookWorkspace";

export const Route = createFileRoute("/flipbook")({
  head: () => ({
    meta: [
      { title: "Flipbook con enlaces interactivos — Editor de hotspots" },
      {
        name: "description",
        content:
          "Convierte tu PDF en un flipbook navegable y añade hotspots que salten a otras páginas, abran URLs o vuelvan al menú. 100 % local en tu navegador.",
      },
      { property: "og:title", content: "Flipbook con hotspots interactivos" },
      {
        property: "og:description",
        content:
          "Modo visualizar y modo editar: dibuja hotspots sobre tu PDF, guárdalos localmente y expórtalos en JSON.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FlipbookRoute,
});

function FlipbookRoute() {
  return (
    <main className="min-h-svh bg-background">
      <div className="flex h-14 items-center justify-between border-b border-border bg-card px-4">
        <h1 className="text-sm font-semibold tracking-tight">Flipbook interactivo</h1>
        <Button asChild variant="ghost" size="sm">
          <Link to="/">
            <ArrowLeft className="mr-2 size-4" /> Volver al editor
          </Link>
        </Button>
      </div>
      <FlipbookWorkspace />
    </main>
  );
}
