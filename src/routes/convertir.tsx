import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { ArrowLeft, FileDown, FileType2, Loader2, ShieldCheck, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { docxToPdf, downloadBlob, pdfToDocx, swapExtension } from "@/lib/convert/wordPdf";

export const Route = createFileRoute("/convertir")({
  head: () => ({
    meta: [
      { title: "Convertir Word a PDF y PDF a Word — 100 % en tu navegador" },
      {
        name: "description",
        content:
          "Convierte documentos DOCX a PDF y PDF a Word sin subir archivos a ningún servidor. Conversión local, rápida y privada dentro del editor PDF.",
      },
      { property: "og:title", content: "Conversor Word ⇄ PDF local" },
      {
        property: "og:description",
        content:
          "Word a PDF y PDF a Word directamente en el navegador: nada sale de tu dispositivo.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ConvertRoute,
});

type Mode = "docx2pdf" | "pdf2docx";

function ConverterCard({
  mode,
  title,
  description,
  accept,
  hint,
  tone,
}: {
  mode: Mode;
  title: string;
  description: string;
  accept: string;
  hint: string;
  tone: "coral" | "lilac";
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0);

  async function run(file: File | undefined) {
    if (!file || busy) return;
    setBusy(true);
    setProgress(0);
    try {
      if (mode === "docx2pdf") {
        if (!/\.docx$/i.test(file.name)) {
          throw new Error("Necesito un archivo .docx (Word moderno).");
        }
        const bytes = await docxToPdf(file);
        downloadBlob(
          new Blob([bytes as unknown as BlobPart], { type: "application/pdf" }),
          swapExtension(file.name, "pdf"),
        );
      } else {
        if (!/\.pdf$/i.test(file.name)) throw new Error("Necesito un archivo .pdf.");
        const blob = await pdfToDocx(file, setProgress);
        downloadBlob(blob, swapExtension(file.name, "docx"));
      }
      toast.success("Conversión lista, descarga iniciada");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo convertir el archivo");
    } finally {
      setBusy(false);
      setProgress(0);
    }
  }

  return (
    <section
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void run(e.dataTransfer.files[0]);
      }}
      className={`card-soft flex flex-col rounded-[28px] p-8 text-center transition-transform ${
        tone === "coral"
          ? "bg-coral text-coral-foreground"
          : "bg-lilac text-lilac-foreground"
      } ${dragging ? "scale-[1.02]" : ""}`}
    >
      <div className="mx-auto inline-flex size-14 items-center justify-center rounded-2xl bg-card/70">
        {mode === "docx2pdf" ? <FileType2 className="size-7" /> : <FileDown className="size-7" />}
      </div>
      <h2 className="mt-4 text-xl font-extrabold tracking-tight">{title}</h2>
      <p className="mt-2 text-sm opacity-85">{description}</p>

      <div className="mt-6 flex flex-1 flex-col items-center justify-end gap-3">
        {busy ? (
          <span className="inline-flex items-center gap-2 text-sm opacity-80">
            <Loader2 className="size-4 animate-spin" />
            Convirtiendo{progress ? ` ${Math.round(progress * 100)}%` : ""}…
          </span>
        ) : (
          <>
            <UploadCloud className="size-7 opacity-80" />
            <Button
              className={`rounded-full font-bold ${
                tone === "coral"
                  ? "bg-amber-soft text-amber-soft-foreground hover:bg-amber-soft/85"
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
              }`}
              onClick={() => inputRef.current?.click()}
            >
              Elegir archivo
            </Button>
          </>
        )}
        <p className="text-xs opacity-75">{hint}</p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          void run(file);
        }}
      />
    </section>
  );
}

function ConvertRoute() {
  return (
    <main className="min-h-screen bg-canvas px-6 py-12">
      <div className="mx-auto w-full max-w-4xl">
        <Button asChild variant="ghost" size="sm" className="mb-6">
          <Link to="/">
            <ArrowLeft className="mr-2 size-4" /> Volver al editor
          </Link>
        </Button>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Conversor Word ⇄ PDF</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Convierte documentos en tu propio dispositivo: arrastra el archivo o elígelo y la
          descarga empieza al terminar.
        </p>

        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <ConverterCard
            mode="docx2pdf"
            title="Word a PDF"
            description="Convierte un .docx en un PDF listo para imprimir o editar en el editor."
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            hint="Conserva títulos, listas y párrafos. Formato .doc antiguo no soportado."
          />
          <ConverterCard
            mode="pdf2docx"
            title="PDF a Word"
            description="Extrae el texto del PDF y genera un .docx editable con una sección por página."
            accept=".pdf,application/pdf"
            hint="Requiere PDFs con texto (no escaneados como imagen)."
          />
        </div>

        <p className="mt-10 inline-flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5" />
          Ningún archivo sale de tu navegador.
        </p>
      </div>
    </main>
  );
}
