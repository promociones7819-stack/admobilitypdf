import { useEffect, useRef, useState } from "react";
import {
  Download,
  Copy,
  FileSearch,
  Loader2,
  ShieldCheck,
  UploadCloud,
  ScanText,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getPdfjs } from "@/lib/pdf/pdfjs";
import { saveBlob } from "@/lib/download";
import { parsePageRange } from "@/lib/pdf/ranges";

type Lang = "spa" | "eng" | "cat" | "fra" | "deu" | "ita" | "por";

interface OcrWord {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

interface OcrPageData {
  text: string;
  confidence: number;
  imageWidth: number;
  imageHeight: number;
  words: OcrWord[];
}

type OcrWorker = {
  recognize: (
    image: unknown,
    options?: { rotateAuto?: boolean },
    output?: { text?: boolean; blocks?: boolean },
  ) => Promise<{
    data: {
      text: string;
      confidence?: number;
      blocks?: Array<{
        paragraphs?: Array<{ lines?: Array<{ words?: OcrWord[] }> }>;
      }> | null;
    };
  }>;
  terminate: () => Promise<unknown>;
};

const MAX_BYTES = 100 * 1024 * 1024;

async function createSearchablePdf(
  bytes: Uint8Array,
  pageData: Array<OcrPageData | null>,
): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.load(bytes.slice(0), {
    ignoreEncryption: true,
    throwOnInvalidObject: false,
  });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  pages.forEach((page, index) => {
    const recognized = pageData[index];
    if (!recognized) return;
    const usableWords = recognized.words
      .filter((word) => word.text.trim() && word.confidence >= 25)
      .slice(0, 15_000);
    if (usableWords.length) {
      const sx = page.getWidth() / Math.max(1, recognized.imageWidth);
      const sy = page.getHeight() / Math.max(1, recognized.imageHeight);
      for (const word of usableWords) {
        const value = word.text.replace(/[^\u0020-\u00ff]/g, "?").slice(0, 120);
        if (!value) continue;
        const size = Math.max(2, Math.min(48, (word.bbox.y1 - word.bbox.y0) * sy * 0.82));
        page.drawText(value, {
          x: Math.max(0, word.bbox.x0 * sx),
          y: Math.max(0, page.getHeight() - word.bbox.y1 * sy),
          size,
          font,
          color: rgb(0, 0, 0),
          opacity: 0,
        });
      }
      return;
    }
    const text = recognized.text
      .replace(/[^\u0020-\u00ff\n]/g, "?")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .join("\n")
      .slice(0, 30_000);
    if (!text) return;
    page.drawText(text, {
      x: 2,
      y: Math.max(2, page.getHeight() - 4),
      size: 1,
      lineHeight: 1.15,
      font,
      color: rgb(0, 0, 0),
      opacity: 0,
      maxWidth: Math.max(1, page.getWidth() - 4),
    });
  });
  return doc.save({ useObjectStreams: true });
}

export function OcrProcessor({
  initialFile,
  onPdfCreated,
}: {
  initialFile?: File | null;
  onPdfCreated?: (file: File) => Promise<void> | void;
} = {}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [text, setText] = useState("");
  const [language, setLanguage] = useState<Lang>("spa");
  const [pageRange, setPageRange] = useState("");
  const [autoRotate, setAutoRotate] = useState(true);
  const [fileName, setFileName] = useState<string | null>(null);
  const [sourceBytes, setSourceBytes] = useState<Uint8Array | null>(null);
  const [pageData, setPageData] = useState<Array<OcrPageData | null>>([]);
  const workerRef = useRef<OcrWorker | null>(null);
  const cancelledRef = useRef(false);
  const initialRef = useRef<File | null>(null);

  async function processPdf(file: File | undefined) {
    if (!file || busy) return;
    if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
      toast.error("Solo se admiten archivos PDF.");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("El archivo supera los 100 MB.");
      return;
    }

    setBusy(true);
    setProgress(0);
    setText("");
    setPageData([]);
    setSourceBytes(null);
    setFileName(file.name);
    setStatus("Leyendo el archivo PDF…");

    let worker: OcrWorker | null = null;
    cancelledRef.current = false;

    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      setSourceBytes(bytes);
      const pdfjs = await getPdfjs();
      const pdf = await pdfjs.getDocument({ data: bytes }).promise;
      const numPages = pdf.numPages;
      let selectedPages: number[];
      try {
        selectedPages = pageRange.trim()
          ? parsePageRange(pageRange, numPages).map((index) => index + 1)
          : Array.from({ length: numPages }, (_, index) => index + 1);
      } catch {
        throw new Error("invalid-page-range");
      }

      setStatus("Inicializando el motor OCR (primera vez puede tardar)…");
      const { createWorker } = await import("tesseract.js");
      worker = (await createWorker(language)) as unknown as OcrWorker;
      workerRef.current = worker;

      const parts: string[] = [];
      const recognizedPages: Array<OcrPageData | null> = Array.from(
        { length: numPages },
        () => null,
      );
      for (let selectedIndex = 0; selectedIndex < selectedPages.length; selectedIndex += 1) {
        const i = selectedPages[selectedIndex]!;
        if (cancelledRef.current) break;
        setStatus(`Procesando página ${i} (${selectedIndex + 1} de ${selectedPages.length})…`);
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("canvas-2d-unavailable");
        await page.render({
          canvas,
          canvasContext: ctx,
          viewport,
        } as Parameters<typeof page.render>[0]).promise;

        const { data } = await worker!.recognize(
          canvas,
          { rotateAuto: autoRotate },
          { text: true, blocks: true },
        );
        const words = (data.blocks ?? []).flatMap((block) =>
          (block.paragraphs ?? []).flatMap((paragraph) =>
            (paragraph.lines ?? []).flatMap((line) => line.words ?? []),
          ),
        );
        recognizedPages[i - 1] = {
          text: (data.text ?? "").trim(),
          confidence: data.confidence ?? 0,
          imageWidth: canvas.width,
          imageHeight: canvas.height,
          words,
        };
        parts.push(`--- Página ${i} ---\n${(data.text ?? "").trim()}`);
        setText(parts.join("\n\n"));
        setProgress(Math.round(((selectedIndex + 1) / selectedPages.length) * 100));
        canvas.width = 0;
        canvas.height = 0;
      }

      setPageData(recognizedPages);
      if (cancelledRef.current) {
        setStatus("OCR cancelado. Puedes conservar el texto ya reconocido.");
        return;
      }

      const average =
        recognizedPages.filter(Boolean).reduce((sum, page) => sum + (page?.confidence ?? 0), 0) /
        Math.max(1, selectedPages.length);
      setStatus(
        `OCR completado: ${selectedPages.length} página(s) · confianza media ${Math.round(average)}%.`,
      );
      toast.success("Texto extraído con OCR");
    } catch (error) {
      if (!cancelledRef.current) {
        console.error(error);
        setStatus("");
        toast.error(
          error instanceof Error && error.message === "invalid-page-range"
            ? "El rango de páginas no es válido."
            : "No se ha podido procesar el PDF con OCR.",
        );
      }
    } finally {
      await worker?.terminate().catch(() => undefined);
      workerRef.current = null;
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!initialFile || initialRef.current === initialFile) return;
    initialRef.current = initialFile;
    void processPdf(initialFile);
    // El fichero inicial solo se procesa una vez por identidad.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFile]);

  async function downloadTxt() {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const name = (fileName ?? "documento.pdf").replace(/\.pdf$/i, "") + "-ocr.txt";
    await saveBlob(blob, name);
  }

  async function downloadSearchablePdf() {
    if (!sourceBytes || !pageData.some(Boolean)) return;
    try {
      const bytes = await createSearchablePdf(sourceBytes, pageData);
      const name = (fileName ?? "documento.pdf").replace(/\.pdf$/i, "") + "-ocr-buscable.pdf";
      const file = new File([bytes.slice(0) as unknown as BlobPart], name, {
        type: "application/pdf",
      });
      if (onPdfCreated) {
        await onPdfCreated(file);
        toast.success("PDF buscable abierto en el editor");
      } else {
        await saveBlob(file, name);
        toast.success("PDF buscable guardado");
      }
    } catch (error) {
      console.error("[ocr] PDF buscable", error);
      toast.error("No se ha podido crear el PDF buscable.");
    }
  }

  return (
    <section className="mx-auto w-full max-w-3xl space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex-1 space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">OCR local de PDF</h2>
          <p className="text-sm text-muted-foreground">
            Reconoce texto de PDFs escaneados. El archivo se procesa en tu navegador; la primera vez
            puede necesitar Internet para descargar el motor y el idioma.
          </p>
        </div>
        <div className="w-40 space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Idioma</label>
          <Select value={language} onValueChange={(v) => setLanguage(v as Lang)} disabled={busy}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="spa">Español</SelectItem>
              <SelectItem value="eng">Inglés</SelectItem>
              <SelectItem value="cat">Catalán</SelectItem>
              <SelectItem value="fra">Francés</SelectItem>
              <SelectItem value="deu">Alemán</SelectItem>
              <SelectItem value="ita">Italiano</SelectItem>
              <SelectItem value="por">Portugués</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-44 space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Páginas</label>
          <Input
            value={pageRange}
            onChange={(event) => setPageRange(event.target.value)}
            disabled={busy}
            placeholder="Todas o 1-3, 7"
          />
        </div>
        <label className="flex h-10 items-center gap-2 text-sm">
          <Checkbox
            checked={autoRotate}
            onCheckedChange={(value) => setAutoRotate(value === true)}
            disabled={busy}
          />
          Corregir orientación
        </label>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void processPdf(e.dataTransfer.files?.[0]);
        }}
        className={`rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
          dragging ? "border-primary bg-primary/5" : "border-border bg-card"
        }`}
      >
        <span className="mx-auto mb-3 inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          {busy ? <Loader2 className="size-5 animate-spin" /> : <ScanText className="size-5" />}
        </span>
        <p className="text-sm font-medium">Arrastra un PDF aquí</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {fileName ?? "o selecciónalo desde tu dispositivo"}
        </p>
        <Button
          className="mt-4"
          size="sm"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          <UploadCloud className="mr-2 size-4" /> Seleccionar PDF
        </Button>
        {busy && (
          <Button
            className="mt-4"
            size="sm"
            variant="outline"
            onClick={() => {
              cancelledRef.current = true;
              void workerRef.current?.terminate();
            }}
          >
            <X className="mr-2 size-4" /> Cancelar
          </Button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            void processPdf(file);
          }}
        />
      </div>

      {(busy || progress > 0) && (
        <div className="space-y-2">
          <Progress value={progress} />
          <p className="text-xs text-muted-foreground">{status || `${progress}%`}</p>
        </div>
      )}

      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">
          Texto reconocido (editable)
        </label>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={14}
          placeholder="El texto extraído aparecerá aquí…"
          className="font-mono text-xs"
        />
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={!text}
            onClick={() => {
              void navigator.clipboard
                .writeText(text)
                .then(() => toast.success("Texto copiado"))
                .catch(() => toast.error("No se ha podido copiar"));
            }}
          >
            <Copy className="mr-2 size-4" /> Copiar
          </Button>
          <Button size="sm" disabled={!text} onClick={downloadTxt}>
            <Download className="mr-2 size-4" /> Descargar .txt
          </Button>
          <Button
            size="sm"
            disabled={!pageData.some(Boolean) || !sourceBytes}
            onClick={() => void downloadSearchablePdf()}
          >
            <FileSearch className="mr-2 size-4" /> Crear PDF buscable
          </Button>
        </div>
      </div>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="size-4 text-primary" /> Procesamiento privado: tu PDF nunca se sube
        a un servidor.
      </p>
    </section>
  );
}
