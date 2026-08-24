import { useRef, useState } from "react";
import { AlertCircle, FileText, Loader2, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useAi } from "@/lib/ai/store";

const ACCEPT = ".pdf,.txt,.md,.markdown";

export function SourcesPanel() {
  const { sources, jobs, addFiles, removeSource, toggleSource, activeNotebook, createNotebook } =
    useAi();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  async function handleFiles(files: File[]) {
    if (!files.length) return;
    let notebookId = activeNotebook?.id;
    if (!notebookId) notebookId = (await createNotebook("Mi cuaderno")).id;
    await addFiles(files, notebookId);
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void handleFiles(Array.from(event.dataTransfer.files));
        }}
        className={cn(
          "rounded-lg border border-dashed p-4 text-center transition-colors",
          dragging ? "border-primary bg-primary/5" : "border-border",
        )}
      >
        <Upload className="mx-auto size-5 text-muted-foreground" />
        <p className="mt-2 text-xs text-muted-foreground">Arrastra PDF, TXT o Markdown aquí</p>
        <Button
          size="sm"
          variant="secondary"
          className="mt-3"
          onClick={() => inputRef.current?.click()}
        >
          Añadir fuentes
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          hidden
          onChange={(event) => {
            void handleFiles(Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
        />
      </div>

      {jobs.map((job) => (
        <div key={job.sourceId} className="rounded-md border border-border p-2">
          <div className="flex items-center gap-2 text-xs">
            <Loader2 className="size-3.5 animate-spin text-primary" />
            <span className="truncate font-medium">{job.name}</span>
          </div>
          <Progress value={Math.round(job.ratio * 100)} className="mt-2 h-1.5" />
          <p className="mt-1 text-[11px] text-muted-foreground">{job.label}…</p>
        </div>
      ))}

      <ScrollArea className="min-h-0 flex-1">
        <ul className="space-y-1 pr-2">
          {sources.map((source) => (
            <li
              key={source.id}
              className="group flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted"
            >
              {source.status === "error" ? (
                <AlertCircle className="size-4 shrink-0 text-destructive" />
              ) : source.status === "processing" ? (
                <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
              ) : (
                <FileText className="size-4 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate">{source.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {source.status === "ready"
                    ? `${source.pageCount} pág · ${source.chunkCount} fragmentos`
                    : source.status === "error"
                      ? (source.error ?? "Error")
                      : "Procesando…"}
                </p>
              </div>
              <Switch
                checked={source.enabled}
                onCheckedChange={(checked) => void toggleSource(source.id, checked)}
                aria-label={`Usar ${source.name}`}
              />
              <button
                type="button"
                aria-label={`Eliminar ${source.name}`}
                onClick={() => {
                  if (!window.confirm(`¿Eliminar la fuente «${source.name}» del cuaderno?`)) return;
                  void removeSource(source.id);
                }}
                className="rounded p-1 opacity-70 transition-opacity hover:opacity-100 focus-visible:opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100"
              >
                <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
              </button>
            </li>
          ))}
          {!sources.length && !jobs.length && (
            <li className="px-2 py-6 text-center text-xs text-muted-foreground">
              Sin fuentes todavía. Todo se procesa en tu dispositivo.
            </li>
          )}
        </ul>
      </ScrollArea>
    </div>
  );
}
