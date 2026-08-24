import { useRef, useState } from "react";
import {
  FileDown,
  FileType2,
  Images,
  Loader2,
  ShieldCheck,
  UploadCloud,
  Presentation,
  Sheet,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { IMAGE_PDF_ACCEPT, imagesPdfName, imagesToPdf } from "@/lib/convert/imagesPdf";
import { docxToPdf, downloadBlob, pdfToDocx, swapExtension } from "@/lib/convert/wordPdf";
import { excelToPdf, powerpointToPdf } from "@/lib/convert/officePdf";

type Mode = "docx2pdf" | "pdf2docx" | "images2pdf" | "pptx2pdf" | "xlsx2pdf";

interface ConverterCardProps {
  mode: Mode;
  title: string;
  description: string;
  accept: string;
  hint: string;
  tone: "coral" | "lilac" | "mint";
  multiple?: boolean;
  onPdfCreated?: (file: File) => Promise<void> | void;
}

function pdfFile(bytes: Uint8Array, name: string): File {
  return new File([bytes.slice(0) as unknown as BlobPart], name, { type: "application/pdf" });
}

function ConverterCard({
  mode,
  title,
  description,
  accept,
  hint,
  tone,
  multiple = false,
  onPdfCreated,
}: ConverterCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0);

  async function deliverPdf(bytes: Uint8Array, name: string) {
    const file = pdfFile(bytes, name);
    if (onPdfCreated) {
      await onPdfCreated(file);
      toast.success("PDF creado y abierto en el editor");
      return;
    }
    downloadBlob(file, name);
    toast.success("Conversión lista, descarga iniciada");
  }

  async function run(files: File[]) {
    const file = files[0];
    if (!file || busy) return;
    setBusy(true);
    setProgress(0);
    try {
      if (mode === "images2pdf") {
        const accepted = files.every(
          (item) =>
            /\.(jpe?g|heic|heif)$/i.test(item.name) || /image\/(jpeg|hei[cf])/i.test(item.type),
        );
        if (!accepted) throw new Error("Selecciona solamente imágenes JPG o HEIC.");
        const bytes = await imagesToPdf(files, (done, total) => setProgress(done / total));
        await deliverPdf(bytes, imagesPdfName(files));
      } else if (mode === "docx2pdf") {
        if (!/\.docx$/i.test(file.name)) {
          throw new Error("Necesito un archivo .docx (Word moderno).");
        }
        const bytes = await docxToPdf(file);
        await deliverPdf(bytes, swapExtension(file.name, "pdf"));
      } else if (mode === "pptx2pdf") {
        if (!/\.pptx$/i.test(file.name)) throw new Error("Necesito un archivo .pptx.");
        await deliverPdf(await powerpointToPdf(file), swapExtension(file.name, "pdf"));
      } else if (mode === "xlsx2pdf") {
        if (!/\.xlsx$/i.test(file.name)) throw new Error("Necesito un archivo .xlsx.");
        await deliverPdf(await excelToPdf(file), swapExtension(file.name, "pdf"));
      } else {
        if (!/\.pdf$/i.test(file.name)) throw new Error("Necesito un archivo .pdf.");
        const blob = await pdfToDocx(file, setProgress);
        downloadBlob(blob, swapExtension(file.name, "docx"));
        toast.success("Texto del PDF convertido a Word");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo convertir el archivo");
    } finally {
      setBusy(false);
      setProgress(0);
    }
  }

  return (
    <section
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        void run(Array.from(event.dataTransfer.files));
      }}
      className={`card-soft flex min-h-80 flex-col rounded-[28px] p-8 text-center transition-transform ${
        tone === "coral"
          ? "bg-coral text-coral-foreground"
          : tone === "lilac"
            ? "bg-lilac text-lilac-foreground"
            : "bg-mint text-mint-foreground"
      } ${dragging ? "scale-[1.02]" : ""}`}
    >
      <div className="mx-auto inline-flex size-14 items-center justify-center rounded-2xl bg-card/70">
        {mode === "docx2pdf" ? (
          <FileType2 className="size-7" />
        ) : mode === "pdf2docx" ? (
          <FileDown className="size-7" />
        ) : mode === "pptx2pdf" ? (
          <Presentation className="size-7" />
        ) : mode === "xlsx2pdf" ? (
          <Sheet className="size-7" />
        ) : (
          <Images className="size-7" />
        )}
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
              {mode === "images2pdf" ? "Elegir fotos" : "Elegir archivo"}
            </Button>
          </>
        )}
        <p className="text-xs opacity-75">{hint}</p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          void run(files);
        }}
      />
    </section>
  );
}

export function ConverterWorkspace({
  onPdfCreated,
}: {
  onPdfCreated?: (file: File) => Promise<void> | void;
}) {
  return (
    <div className="pastel-canvas h-full overflow-y-auto px-6 py-10">
      <div className="mx-auto w-full max-w-6xl">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl">
          Conversor de documentos e imágenes
        </h1>
        <p className="mt-3 max-w-3xl text-base text-muted-foreground sm:text-lg">
          Word y PDF ofrecen una conversión básica de contenido. Las fotos conservan su orden y
          proporción. Cuando vienes desde el editor, el PDF creado se abre automáticamente.
        </p>

        <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <ConverterCard
            mode="docx2pdf"
            title="Word a PDF"
            description="Convierte títulos, listas y párrafos de un .docx en un PDF editable."
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            hint="Conversión básica: los diseños Word complejos pueden simplificarse."
            tone="coral"
            {...(onPdfCreated ? { onPdfCreated } : {})}
          />
          <ConverterCard
            mode="pptx2pdf"
            title="PowerPoint a PDF"
            description="Convierte cada diapositiva en una página apaisada y conserva su texto."
            accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
            hint="Las animaciones y composiciones muy complejas se simplifican."
            tone="coral"
            {...(onPdfCreated ? { onPdfCreated } : {})}
          />
          <ConverterCard
            mode="xlsx2pdf"
            title="Excel a PDF"
            description="Convierte las hojas de un libro Excel en tablas PDF apaisadas."
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            hint="Optimizado para tablas de hasta diez columnas visibles."
            tone="lilac"
            {...(onPdfCreated ? { onPdfCreated } : {})}
          />
          <ConverterCard
            mode="pdf2docx"
            title="Extraer texto a Word"
            description="Genera un .docx editable con el texto extraíble, separado por páginas."
            accept=".pdf,application/pdf"
            hint="No conserva maquetaciones complejas ni reconoce páginas escaneadas."
            tone="lilac"
          />
          <ConverterCard
            mode="images2pdf"
            title="JPG y HEIC a PDF"
            description="Crea un PDF con una fotografía por página, respetando el orden."
            accept={IMAGE_PDF_ACCEPT}
            multiple
            hint="JPG, JPEG, HEIC o HEIF. Puedes seleccionar varias fotos."
            tone="mint"
            {...(onPdfCreated ? { onPdfCreated } : {})}
          />
        </div>

        <p className="mt-8 inline-flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5" /> Ningún documento se sube a un servidor.
        </p>
      </div>
    </div>
  );
}
