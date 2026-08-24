import { useMemo, useState } from "react";
import { Download, Gauge, Loader2, Minimize2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { downloadBytes } from "@/lib/pdf/export";
import {
  formatMB,
  type OptimizeLevel,
  type OptimizeProgress,
  type OptimizeResult,
} from "@/lib/pdf/optimize";
import { runOptimization } from "@/lib/pdf/optimizeClient";
import { usePdfEditor } from "@/lib/pdf/store";

const LEVELS: Array<{ value: OptimizeLevel; label: string; hint: string; target: number }> = [
  {
    value: "quality",
    label: "Alta calidad",
    hint: "Reduce ligeramente y prioriza la nitidez.",
    target: 0.85,
  },
  {
    value: "balanced",
    label: "Equilibrado",
    hint: "Buena reducción manteniendo una lectura cómoda.",
    target: 0.6,
  },
  {
    value: "max",
    label: "Máxima reducción",
    hint: "Genera el archivo más pequeño posible.",
    target: 0.35,
  },
];

const PHASES: Record<OptimizeProgress["phase"], string> = {
  analyze: "Analizando el PDF con tus cambios…",
  rebuild: "Reorganizando el documento…",
  raster: "Comprimiendo páginas",
  validate: "Comprobando el resultado…",
};

function compressedName(name: string): string {
  return `${name.replace(/\.pdf$/i, "")}-reducido.pdf`;
}

export function CompressPdfDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { exportFile, markSaved } = usePdfEditor();
  const [level, setLevel] = useState<OptimizeLevel>("balanced");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<OptimizeProgress | null>(null);
  const [result, setResult] = useState<OptimizeResult | null>(null);
  const [outputName, setOutputName] = useState("documento-reducido.pdf");

  const selected = LEVELS.find((item) => item.value === level) ?? LEVELS[1]!;
  const reduction = useMemo(
    () => (result ? Math.max(0, Math.round((1 - result.size / result.originalSize) * 100)) : 0),
    [result],
  );

  function reset() {
    setRunning(false);
    setProgress(null);
    setResult(null);
  }

  function close() {
    if (running) return;
    reset();
    onOpenChange(false);
  }

  async function compress() {
    setRunning(true);
    setResult(null);
    setProgress({ phase: "analyze", done: 0, total: 1 });
    try {
      // exportFile construye primero el PDF actual, incluidas todas las ediciones.
      const edited = await exportFile();
      const bytes = new Uint8Array(await edited.arrayBuffer());
      const target = Math.max(512 * 1024, Math.round(bytes.byteLength * selected.target));
      const run = await runOptimization(bytes, level, target, setProgress);
      if (!run.validation.ok) {
        throw new Error(`validación: ${run.validation.reason}`);
      }
      setOutputName(compressedName(edited.name));
      setResult(run.result);
      if (run.result.size >= run.result.originalSize) {
        toast.info("El PDF ya está optimizado; no se puede reducir más sin degradarlo.");
      }
    } catch (error) {
      console.error("[pdf] recompresión del documento editado", error);
      toast.error("No se ha podido reducir el PDF. Tus cambios siguen intactos en el editor.");
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }

  async function download() {
    if (!result) return;
    await downloadBytes(result.bytes, outputName);
    markSaved();
    toast.success("PDF reducido guardado con todos los cambios");
    close();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (running) return;
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Minimize2 className="size-4 text-primary" /> Reducir el PDF editado
          </DialogTitle>
          <DialogDescription>
            Primero se aplican los textos, imágenes, páginas y demás cambios; después se comprime
            esa copia. El documento que estás editando permanece intacto.
          </DialogDescription>
        </DialogHeader>

        {running ? (
          <div className="space-y-3 py-2">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {progress ? PHASES[progress.phase] : "Preparando el PDF…"}
              {progress?.phase === "raster" ? ` ${progress.done}/${progress.total}` : ""}
            </p>
            <Progress
              value={progress && progress.total > 0 ? (progress.done / progress.total) * 100 : 5}
            />
          </div>
        ) : result ? (
          <div className="space-y-2 rounded-xl border border-border bg-muted/40 p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Antes</span>
              <span>{formatMB(result.originalSize)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Después</span>
              <span className="font-semibold">{formatMB(result.size)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Reducción</span>
              <span>{reduction}%</span>
            </div>
            <p className="pt-1 text-xs text-muted-foreground">
              {reduction > 0
                ? "La copia reducida conserva los cambios visibles del editor."
                : "El archivo ya estaba optimizado; se conservará con su tamaño actual."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <Select value={level} onValueChange={(value) => setLevel(value as OptimizeLevel)}>
              <SelectTrigger aria-label="Nivel de reducción">
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
            <p className="text-xs text-muted-foreground">{selected.hint}</p>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" disabled={running} onClick={close}>
            Cancelar
          </Button>
          {result ? (
            <>
              <Button variant="outline" onClick={() => setResult(null)}>
                Probar otro nivel
              </Button>
              <Button onClick={() => void download()}>
                <Download className="mr-2 size-4" /> Descargar PDF reducido
              </Button>
            </>
          ) : (
            <Button disabled={running} onClick={() => void compress()}>
              <Gauge className="mr-2 size-4" /> Reducir ahora
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
