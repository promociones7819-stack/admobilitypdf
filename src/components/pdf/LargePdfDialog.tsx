import { useState } from "react";
import { Gauge, Loader2, Sparkles, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePdfEditor } from "@/lib/pdf/store";
import {
  formatMB,
  LARGE_PDF_BYTES,
  type OptimizeLevel,
  type OptimizeProgress,
  type OptimizeResult,
} from "@/lib/pdf/optimize";
import { runOptimization } from "@/lib/pdf/optimizeClient";

const LEVELS: { value: OptimizeLevel; label: string; hint: string }[] = [
  {
    value: "smart",
    label: "Optimización inteligente ⭐",
    hint: "Analiza el PDF y busca bajar de 150 MB con la mejor calidad posible.",
  },
  { value: "quality", label: "Máxima calidad", hint: "Reduce solo lo imprescindible." },
  { value: "balanced", label: "Equilibrado", hint: "Buen equilibrio tamaño/legibilidad." },
  {
    value: "max",
    label: "Máxima compresión",
    hint: "Prioriza el tamaño y conserva el texto cuando el documento no es escaneado.",
  },
];

const PHASES: Record<OptimizeProgress["phase"], string> = {
  analyze: "Analizando el documento…",
  rebuild: "Reconstruyendo la estructura…",
  raster: "Optimizando páginas",
  validate: "Validando el PDF…",
};

export function LargePdfDialog() {
  const { largePrompt, dismissLargePrompt, openFiles } = usePdfEditor();
  const [level, setLevel] = useState<OptimizeLevel>("smart");
  const [showLevels, setShowLevels] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<OptimizeProgress | null>(null);
  const [result, setResult] = useState<OptimizeResult | null>(null);

  const file = largePrompt?.oversized[0] ?? null;
  const open = Boolean(largePrompt);

  function reset() {
    setRunning(false);
    setProgress(null);
    setResult(null);
    setShowLevels(false);
  }

  async function optimize(selected: OptimizeLevel) {
    if (!file) return;
    setRunning(true);
    setResult(null);
    setProgress({ phase: "analyze", done: 0, total: 1 });
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const run = await runOptimization(bytes, selected, LARGE_PDF_BYTES, setProgress);
      if (!run.validation.ok) {
        toast.error(
          `La copia optimizada no ha pasado la validación (${run.validation.reason}). Se conserva el original.`,
        );
        setResult(null);
        return;
      }
      setResult(run.result);
    } catch (error) {
      console.error("[pdf] optimización", error);
      toast.error("No se ha podido optimizar el PDF. Puedes trabajar con el original.");
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }

  async function openOptimized() {
    if (!result || !file) return;
    const name = file.name.replace(/\.pdf$/i, "") + "-optimizado.pdf";
    const copy = new File([result.bytes.slice(0) as unknown as BlobPart], name, {
      type: "application/pdf",
    });
    const rest = (largePrompt?.files ?? []).filter((f) => f !== file);
    reset();
    await openFiles([copy, ...rest], { force: true });
    toast.success("PDF optimizado abierto en el editor");
  }

  async function openOriginal() {
    const files = largePrompt?.files ?? [];
    reset();
    await openFiles(files, { force: true });
  }

  const reduction = result
    ? Math.max(0, Math.round((1 - result.size / result.originalSize) * 100))
    : 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !running) {
          reset();
          dismissLargePrompt();
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TriangleAlert className="size-4 text-primary" />
            PDF de gran tamaño
          </DialogTitle>
          <DialogDescription>
            Este PDF supera el tamaño recomendado para trabajar cómodamente en la aplicación.
            {file ? ` (${file.name} — ${formatMB(file.size)})` : ""} El original nunca se modifica:
            se crea una copia optimizada.
          </DialogDescription>
        </DialogHeader>

        {running ? (
          <div className="space-y-3 py-2">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {progress ? PHASES[progress.phase] : "Preparando…"}
              {progress?.phase === "raster"
                ? ` ${progress.done}/${progress.total}${progress.pass ? ` · pasada ${progress.pass}` : ""}`
                : ""}
            </p>
            <Progress
              value={progress && progress.total > 0 ? (progress.done / progress.total) * 100 : 5}
            />
            <p className="text-xs text-muted-foreground">
              Todo el proceso ocurre en tu dispositivo. Puede tardar unos minutos.
            </p>
          </div>
        ) : result ? (
          <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Original</span>
              <span>{formatMB(result.originalSize)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Optimizado</span>
              <span className="font-medium">{formatMB(result.size)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Reducción</span>
              <span>{reduction} %</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Páginas</span>
              <span>{result.pageCount}</span>
            </div>
            <p className="pt-1 text-xs text-muted-foreground">
              {result.textPreserved
                ? "Texto seleccionable y buscable conservado."
                : "Páginas optimizadas como imagen para reducir el tamaño."}
              {result.size > LARGE_PDF_BYTES
                ? " No se ha podido bajar de 150 MB: puedes probar otra compresión o trabajar con el original."
                : ""}
            </p>
          </div>
        ) : showLevels ? (
          <div className="space-y-3">
            <Select value={level} onValueChange={(v) => setLevel(v as OptimizeLevel)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEVELS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {LEVELS.find((l) => l.value === level)?.hint}
            </p>
          </div>
        ) : null}

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
          {result ? (
            <>
              <Button
                variant="ghost"
                onClick={() => {
                  setResult(null);
                  setShowLevels(true);
                }}
              >
                Intentar otra compresión
              </Button>
              <Button variant="outline" onClick={() => void openOriginal()}>
                Trabajar con el original
              </Button>
              <Button onClick={() => void openOptimized()}>Usar PDF optimizado</Button>
            </>
          ) : showLevels ? (
            <>
              <Button variant="ghost" disabled={running} onClick={() => setShowLevels(false)}>
                Volver
              </Button>
              <Button disabled={running} onClick={() => void optimize(level)}>
                <Gauge className="mr-2 size-4" /> Optimizar
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                disabled={running}
                onClick={() => {
                  reset();
                  dismissLargePrompt();
                }}
              >
                Cancelar
              </Button>
              <Button variant="outline" disabled={running} onClick={() => void openOriginal()}>
                Trabajar con el original
              </Button>
              <Button variant="outline" disabled={running} onClick={() => setShowLevels(true)}>
                Elegir nivel
              </Button>
              <Button
                disabled={running}
                onClick={() => {
                  setLevel("smart");
                  void optimize("smart");
                }}
              >
                <Sparkles className="mr-2 size-4" /> Optimización inteligente
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
