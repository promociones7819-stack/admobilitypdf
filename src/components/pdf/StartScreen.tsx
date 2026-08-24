import { useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  BookOpen,
  BrainCircuit,
  Circle,
  Cloud,
  FilePlus2,
  FileScan,
  FileText,
  Gauge,
  Image,
  Layers,
  Loader2,
  ScanText,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { usePdfEditor, friendlyError } from "@/lib/pdf/store";
import { LARGE_PDF_BYTES } from "@/lib/pdf/optimize";

function DoodleBackdrop() {
  const base = "pointer-events-none absolute stroke-[1.5] opacity-35";
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <Star className={`${base} left-[2%] top-[8%] size-12 rotate-12 text-primary`} />
      <Circle className={`${base} left-[8%] top-[2%] size-7 text-sky-500`} />
      <FileText className={`${base} left-[17%] top-[16%] size-14 -rotate-12 text-rose-400`} />
      <Cloud className={`${base} left-[32%] top-[5%] size-16 text-sky-400`} />
      <Send className={`${base} left-[5%] top-[44%] size-11 -rotate-12 text-amber-500`} />
      <Image className={`${base} bottom-[9%] left-[3%] size-16 rotate-12 text-teal-500`} />
      <Sparkles className={`${base} bottom-[3%] left-[24%] size-11 text-amber-500`} />
      <Star className={`${base} right-[4%] top-[6%] size-10 -rotate-12 text-amber-500`} />
      <Cloud className={`${base} right-[13%] top-[13%] size-20 text-violet-400`} />
      <FileScan className={`${base} right-[2%] top-[34%] size-14 rotate-12 text-sky-500`} />
      <Circle className={`${base} right-[18%] top-[3%] size-16 text-rose-400`} />
      <Send className={`${base} bottom-[6%] right-[24%] size-12 rotate-12 text-sky-500`} />
      <Image className={`${base} bottom-[18%] right-[3%] size-16 -rotate-12 text-teal-500`} />
      <Star className={`${base} bottom-[4%] right-[11%] size-11 text-primary`} />
    </div>
  );
}

function ToolCard({
  icon,
  title,
  description,
  tone,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  tone: "coral" | "lilac";
  action: ReactNode;
}) {
  return (
    <article
      className={`card-soft flex min-h-72 flex-col items-center rounded-[32px] px-7 py-8 text-center sm:min-h-80 sm:px-9 sm:py-10 ${
        tone === "coral"
          ? "bg-coral text-coral-foreground"
          : "bg-lilac text-lilac-foreground"
      }`}
    >
      <span className="inline-flex size-16 items-center justify-center rounded-2xl bg-card/80 shadow-sm [&>svg]:size-7">
        {icon}
      </span>
      <h3 className="mt-6 text-xl font-extrabold tracking-tight">{title}</h3>
      <p className="mt-3 max-w-sm text-sm leading-6 opacity-75 sm:text-base">{description}</p>
      <div className="mt-auto pt-7">{action}</div>
    </article>
  );
}

const toolButtonClass =
  "rounded-full border-0 bg-card px-6 font-bold text-card-foreground shadow-sm hover:bg-card/85";

export function StartScreen({ onRequestCompression }: { onRequestCompression: () => void }) {
  const { openFiles, busy } = usePdfEditor();
  const singleRef = useRef<HTMLInputElement>(null);
  const multiRef = useRef<HTMLInputElement>(null);
  const compressRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  async function handle(files: FileList | File[] | null, purpose: "open" | "compress" = "open") {
    const list = Array.from(files ?? []);
    if (list.length === 0) return;
    const oversized = list.some((file) => file.size > LARGE_PDF_BYTES);
    try {
      await openFiles(list);
      if (purpose === "compress") {
        if (!oversized) onRequestCompression();
        else toast.info("Elige el nivel de optimización para abrir el PDF reducido.");
      } else if (!oversized) {
        toast.success(list.length > 1 ? `${list.length} PDFs combinados` : "Documento abierto");
      }
    } catch (error) {
      toast.error(friendlyError(error));
    }
  }

  return (
    <main className="pastel-canvas relative isolate min-h-screen overflow-x-hidden px-5 py-8 sm:px-8 sm:py-10">
      <DoodleBackdrop />
      <div className="relative z-10 mx-auto w-full max-w-7xl">
        <h1 className="sr-only">PDF Maestro: editor y herramientas PDF</h1>

        <section
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            void handle(event.dataTransfer.files);
          }}
          className={`card-soft rounded-[36px] border-2 border-dashed bg-card/85 px-6 py-12 text-center backdrop-blur-sm transition sm:py-16 ${
            dragging ? "scale-[1.01] border-primary bg-card" : "border-border"
          }`}
        >
          {busy ? (
            <div className="flex min-h-44 flex-col items-center justify-center gap-3 text-muted-foreground">
              <Loader2 className="size-8 animate-spin text-primary" />
              <p className="text-sm">Preparando el documento…</p>
            </div>
          ) : (
            <>
              <span className="mx-auto inline-flex size-16 items-center justify-center rounded-3xl bg-primary/10 text-primary">
                <UploadCloud className="size-8" />
              </span>
              <h2 className="mt-6 text-2xl font-extrabold tracking-tight sm:text-3xl">
                Arrastra tus PDFs aquí
              </h2>
              <p className="mt-2 text-sm text-muted-foreground sm:text-base">
                o elige una opción para comenzar
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Button
                  size="lg"
                  className="min-w-48 rounded-full font-bold"
                  onClick={() => singleRef.current?.click()}
                >
                  <FilePlus2 className="mr-2 size-4" /> Abrir PDF
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="min-w-48 rounded-full bg-card font-bold"
                  onClick={() => multiRef.current?.click()}
                >
                  <Layers className="mr-2 size-4" /> Combinar PDFs
                </Button>
              </div>
            </>
          )}
        </section>

        <section className="pb-6 pt-14 sm:pt-16" aria-labelledby="tools-heading">
          <h2 id="tools-heading" className="text-center text-3xl font-extrabold tracking-tight">
            Todas las herramientas
          </h2>

          <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <ToolCard
              tone="coral"
              icon={<Gauge />}
              title="Reducir tamaño"
              description="Comprime el PDF después de aplicar tus textos, imágenes y demás cambios."
              action={
                <Button className={toolButtonClass} onClick={() => compressRef.current?.click()}>
                  Comprimir PDF
                </Button>
              }
            />
            <ToolCard
              tone="lilac"
              icon={<FileText />}
              title="Conversores"
              description="Convierte Word ⇄ PDF y transforma fotos JPG o HEIC en un único PDF."
              action={
                <Button asChild className={toolButtonClass}>
                  <Link to="/convertir">Abrir conversores</Link>
                </Button>
              }
            />
            <ToolCard
              tone="coral"
              icon={<BookOpen />}
              title="Flipbook interactivo"
              description="Crea un manual con paso de páginas, botones 3D, índice y enlaces en HTML."
              action={
                <Button asChild className={toolButtonClass}>
                  <Link to="/flipbook">Crear flipbook</Link>
                </Button>
              }
            />
            <ToolCard
              tone="lilac"
              icon={<ScanText />}
              title="OCR de escaneados"
              description="Extrae el texto de PDFs escaneados directamente en tu dispositivo."
              action={
                <Button asChild className={toolButtonClass}>
                  <Link to="/ocr">Reconocer texto</Link>
                </Button>
              }
            />
            <ToolCard
              tone="coral"
              icon={<BrainCircuit />}
              title="Asistente de estudio"
              description="Pregunta a tus documentos y genera resúmenes con inteligencia artificial local."
              action={
                <Button asChild className={toolButtonClass}>
                  <Link to="/ia">Abrir asistente</Link>
                </Button>
              }
            />
            <ToolCard
              tone="lilac"
              icon={<Layers />}
              title="Organizar páginas"
              description="Reordena, rota, duplica, extrae y elimina páginas de tus documentos."
              action={
                <Button className={toolButtonClass} onClick={() => singleRef.current?.click()}>
                  Abrir editor
                </Button>
              }
            />
          </div>
        </section>

        <footer className="relative flex items-end justify-center pb-5 pt-2">
          <p className="inline-flex items-center gap-2 text-xs text-muted-foreground sm:text-sm">
            <ShieldCheck className="size-4" /> Ningún archivo sale de tu navegador.
          </p>
          <img
            src="/brand/ad-mobility.png"
            alt="AD Mobility"
            className="absolute bottom-1 right-0 hidden h-16 w-auto drop-shadow-sm sm:block"
          />
        </footer>
      </div>

      <input
        ref={singleRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(event) => {
          void handle(event.target.files);
          event.target.value = "";
        }}
      />
      <input
        ref={multiRef}
        type="file"
        accept="application/pdf"
        multiple
        className="hidden"
        onChange={(event) => {
          void handle(event.target.files);
          event.target.value = "";
        }}
      />
      <input
        ref={compressRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(event) => {
          void handle(event.target.files, "compress");
          event.target.value = "";
        }}
      />
    </main>
  );
}
