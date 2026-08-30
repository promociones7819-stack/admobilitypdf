import { useEffect, useState } from "react";
import { BrainCircuit, Cpu, Download, FileSearch, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { LOCAL_MODELS } from "@/lib/ai/llm";
import { onModelDownloadProgress } from "@/lib/ai/embeddings";
import { useAi } from "@/lib/ai/store";

export function EnginePanel() {
  const {
    webGpu,
    modelId,
    llmLabel,
    embedderLabel,
    activateLocalModel,
    useExtractive: activateExtractive,
    enableNeuralEmbeddings,
  } = useAi();
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");

  useEffect(
    () =>
      onModelDownloadProgress((ratio) => {
        if (busy === "embeddings") setProgress(Math.round(ratio * 100));
      }),
    [busy],
  );

  async function activate(id: string) {
    setBusy(id);
    setProgress(0);
    try {
      await activateLocalModel(id, (info) => {
        setProgress(Math.round((info.progress ?? 0) * 100));
        setStatus(info.text);
      });
      toast.success("Modelo local activo. Nada sale de tu dispositivo.");
    } catch (error) {
      toast.error(
        error instanceof Error && error.message === "webgpu-unavailable"
          ? "Tu navegador no soporta WebGPU"
          : "No se pudo cargar el modelo",
      );
    } finally {
      setBusy(null);
      setStatus("");
    }
  }

  return (
    <div className="space-y-4 text-sm">
      <div className="rounded-lg border border-border bg-muted/40 p-3">
        <div className="flex items-center gap-2 font-medium">
          <ShieldCheck className="size-4 text-primary" />
          Procesamiento 100 % local
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Los documentos, embeddings y respuestas se generan en tu navegador. Sin servidores, sin
          telemetría, funciona offline tras la primera carga.
        </p>
      </div>

      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Motor de respuestas
        </p>
        <p className="text-xs text-muted-foreground">Actual: {llmLabel}</p>
      </div>

      <div className="space-y-2">
        <button
          type="button"
          onClick={() => {
            activateExtractive();
            toast.success("Motor extractivo activo");
          }}
          className="flex w-full items-start gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:bg-muted"
        >
          <Sparkles className="mt-0.5 size-4 text-primary" />
          <span>
            <span className="block font-medium">Extractivo local</span>
            <span className="block text-xs text-muted-foreground">
              Sin descargas. Responde citando frases literales de tus fuentes.
            </span>
          </span>
        </button>

        {LOCAL_MODELS.map((model) => (
          <div key={model.id} className="rounded-lg border border-border p-3">
            <div className="flex items-start gap-3">
              <Cpu className="mt-0.5 size-4 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{model.label}</p>
                <p className="text-xs text-muted-foreground">
                  ~{model.sizeMb} MB de descarga · {model.vramMb} MB VRAM · WebGPU
                </p>
              </div>
              <Button
                size="sm"
                variant={modelId === model.id ? "default" : "secondary"}
                disabled={!webGpu || busy !== null}
                onClick={() => void activate(model.id)}
              >
                {modelId === model.id ? "Activo" : <Download className="size-4" />}
              </Button>
            </div>
            {busy === model.id && (
              <>
                <Progress value={progress} className="mt-3 h-1.5" />
                <p className="mt-1 truncate text-[11px] text-muted-foreground">{status}</p>
              </>
            )}
          </div>
        ))}
        {!webGpu && (
          <p className="text-xs text-muted-foreground">
            Tu navegador no expone WebGPU, así que los modelos generativos locales están
            desactivados. El motor extractivo funciona igual.
          </p>
        )}
      </div>

      <div className="space-y-2 border-t border-border pt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Procesamiento de documentos
        </p>
        <div className="rounded-lg border border-border p-3">
          <div className="flex items-start gap-3">
            <FileSearch className="mt-0.5 size-4 text-primary" />
            <div>
              <p className="font-medium">OCR automático para PDF</p>
              <p className="text-xs text-muted-foreground">
                Activo. Detecta páginas escaneadas y aplica OCR local en español e inglés solo
                cuando falta una capa de texto.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-2 border-t border-border pt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Búsqueda semántica
        </p>
        <p className="text-xs text-muted-foreground">Actual: {embedderLabel}</p>
        <Button
          size="sm"
          variant="secondary"
          disabled={busy !== null}
          onClick={() => {
            setBusy("embeddings");
            setProgress(0);
            setStatus("Descargando Multilingual E5 y reindexando el cuaderno…");
            void enableNeuralEmbeddings((ratio) => setProgress(Math.round(ratio * 100)))
              .then((count) =>
                toast.success(
                  count
                    ? `Búsqueda multilingüe activa · ${count} fragmentos reindexados`
                    : "Búsqueda multilingüe activa",
                ),
              )
              .catch(() => toast.error("No se pudo cargar el modelo de embeddings"))
              .finally(() => {
                setBusy(null);
                setStatus("");
              });
          }}
        >
          <BrainCircuit className="size-4" />
          Activar Multilingual E5 (~120 MB)
        </Button>
        {busy === "embeddings" && (
          <>
            <Progress value={progress} className="h-1.5" />
            <p className="truncate text-[11px] text-muted-foreground">{status}</p>
          </>
        )}
        <p className="text-[11px] text-muted-foreground">
          Combina significado y coincidencias literales para encontrar nombres, conceptos y cifras
          en español con mayor precisión.
        </p>
      </div>
    </div>
  );
}
