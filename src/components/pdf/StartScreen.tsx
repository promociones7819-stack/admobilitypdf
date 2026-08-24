import { useRef, useState } from "react";
import {
  BookOpen,
  FilePlus2,
  FileType2,
  Images,
  Layers,
  Loader2,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { usePdfEditor, friendlyError } from "@/lib/pdf/store";
import { LARGE_PDF_BYTES } from "@/lib/pdf/optimize";
import { IMAGE_PDF_ACCEPT, imagesPdfName, imagesToPdf } from "@/lib/convert/imagesPdf";

export function StartScreen() {
  const { openFiles, busy } = usePdfEditor();
  const singleRef = useRef<HTMLInputElement>(null);
  const multiRef = useRef<HTMLInputElement>(null);
  const imagesRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [convertingImages, setConvertingImages] = useState(false);

  async function handle(files: FileList | File[] | null) {
    const list = Array.from(files ?? []);
    if (list.length === 0) return;
    // Los PDFs muy grandes abren el diálogo de optimización, no el editor.
    const oversized = list.some((f) => f.size > LARGE_PDF_BYTES);
    try {
      await openFiles(list);
      if (oversized) return;
      toast.success(list.length > 1 ? `${list.length} PDFs combinados` : "Documento abierto");
    } catch (error) {
      toast.error(friendlyError(error));
    }
  }

  async function handleImages(files: FileList | File[] | null) {
    const list = Array.from(files ?? []);
    if (list.length === 0) return;
    setConvertingImages(true);
    try {
      const bytes = await imagesToPdf(list);
      const pdf = new File([bytes.slice(0) as unknown as BlobPart], imagesPdfName(list), {
        type: "application/pdf",
      });
      await openFiles([pdf], { force: true });
      toast.success("Fotos convertidas: el PDF está listo para editar");
    } catch (error) {
      console.error("[pdf] conversión de imágenes", error);
      toast.error(error instanceof Error ? error.message : "No se han podido convertir las fotos");
    } finally {
      setConvertingImages(false);
    }
  }

  return (
    <main className="pastel-canvas flex min-h-screen flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-xl text-center">
        <div className="mx-auto mb-6 inline-flex size-14 items-center justify-center rounded-3xl bg-coral text-coral-foreground card-soft">
          <Layers className="size-7" />
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl">
          Editor PDF
        </h1>
        <p className="mt-3 text-base text-muted-foreground sm:text-lg">
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
            const files = Array.from(e.dataTransfer.files);
            const allImages = files.every(
              (file) =>
                /\.(jpe?g|heic|heif)$/i.test(file.name) || /image\/(jpeg|hei[cf])/i.test(file.type),
            );
            if (allImages) void handleImages(files);
            else void handle(files);
          }}
          className={`card-soft mt-10 rounded-3xl border-2 border-dashed bg-card/80 px-6 py-12 backdrop-blur transition-colors ${
            dragging ? "border-primary bg-primary/5" : "border-border"
          }`}
        >
          {busy || convertingImages ? (
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <Loader2 className="size-6 animate-spin" />
              <p className="text-sm">
                {convertingImages ? "Convirtiendo fotos a PDF…" : "Cargando documento…"}
              </p>
            </div>
          ) : (
            <>
              <UploadCloud className="mx-auto size-8 text-muted-foreground" />
              <p className="mt-4 text-sm text-muted-foreground">
                Arrastra PDFs o fotos JPG/HEIC aquí, o elige una opción
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <Button
                  size="lg"
                  className="rounded-full bg-amber-soft font-bold text-amber-soft-foreground hover:bg-amber-soft/85"
                  onClick={() => singleRef.current?.click()}
                >
                  <FilePlus2 className="mr-2 size-4" />
                  Abrir PDF
                </Button>
                <Button
                  size="lg"
                  className="rounded-full bg-lilac font-bold text-lilac-foreground hover:bg-lilac/85"
                  onClick={() => multiRef.current?.click()}
                >
                  <Layers className="mr-2 size-4" />
                  Combinar PDFs
                </Button>
                <Button
                  size="lg"
                  className="rounded-full bg-mint font-bold text-mint-foreground hover:bg-mint/85"
                  onClick={() => imagesRef.current?.click()}
                >
                  <Images className="mr-2 size-4" />
                  JPG/HEIC a PDF
                </Button>
              </div>
            </>
          )}
        </div>

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/convertir">
              <FileType2 className="mr-2 size-4" /> Convertir Word, JPG o HEIC
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
        ref={imagesRef}
        type="file"
        accept={IMAGE_PDF_ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => {
          void handleImages(e.target.files);
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
