import { useRef, useState } from "react";
import {
  BookOpen,
  FilePlus2,
  FileType2,
  Layers,
  Loader2,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { usePdfEditor, friendlyError } from "@/lib/pdf/store";

export function StartScreen() {
  const { openFiles, busy } = usePdfEditor();
  const singleRef = useRef<HTMLInputElement>(null);
  const multiRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  async function handle(files: FileList | File[] | null) {
    const list = Array.from(files ?? []);
    if (list.length === 0) return;
    // Los PDFs muy grandes abren el diálogo de optimización, no el editor.
    const oversized = list.some((f) => f.size > LARGE_PDF_BYTES);
    try {
      await openFiles(list);
      if (oversized) return;
      toast.success(
        list.length > 1 ? `${list.length} PDFs combinados` : "Documento abierto",
      );
    } catch (error) {
      toast.error(friendlyError(error));
    }
  }


  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-canvas px-6 py-16">
      <div className="w-full max-w-xl text-center">
        <div className="mx-auto mb-6 inline-flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Layers className="size-6" />
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Editor PDF
        </h1>
        <p className="mt-3 text-base text-muted-foreground">
          Edita, organiza y anota tus PDFs
        </p>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void handle(e.dataTransfer.files);
          }}
          className={`mt-10 rounded-2xl border-2 border-dashed bg-card px-6 py-12 transition-colors ${
            dragging ? "border-primary bg-primary/5" : "border-border"
          }`}
        >
          {busy ? (
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <Loader2 className="size-6 animate-spin" />
              <p className="text-sm">Cargando documento…</p>
            </div>
          ) : (
            <>
              <UploadCloud className="mx-auto size-8 text-muted-foreground" />
              <p className="mt-4 text-sm text-muted-foreground">
                Arrastra un PDF aquí o elige una opción
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <Button size="lg" onClick={() => singleRef.current?.click()}>
                  <FilePlus2 className="mr-2 size-4" />
                  Abrir PDF
                </Button>
                <Button size="lg" variant="outline" onClick={() => multiRef.current?.click()}>
                  <Layers className="mr-2 size-4" />
                  Combinar PDFs
                </Button>
              </div>
            </>
          )}
        </div>

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/convertir">
              <FileType2 className="mr-2 size-4" /> Convertir Word ⇄ PDF
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/flipbook">
              <BookOpen className="mr-2 size-4" /> Crear flipbook interactivo
            </Link>
          </Button>
        </div>

        <p className="mt-6 inline-flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5" />
          Tu documento se procesa localmente en tu navegador.
        </p>
      </div>

      <input
        ref={singleRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          void handle(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={multiRef}
        type="file"
        accept="application/pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          void handle(e.target.files);
          e.target.value = "";
        }}
      />
    </main>
  );
}
