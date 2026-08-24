import { useState } from "react";
import { BookOpen, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useAi } from "@/lib/ai/store";

export function NotebookList() {
  const { notebooks, activeNotebook, selectNotebook, createNotebook, removeNotebook } = useAi();
  const [name, setName] = useState("");

  async function create() {
    await createNotebook(name || `Cuaderno ${notebooks.length + 1}`);
    setName("");
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-2">
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void create();
          }}
          placeholder="Nuevo cuaderno"
          className="h-9"
        />
        <Button
          size="icon"
          variant="secondary"
          onClick={() => void create()}
          aria-label="Crear cuaderno"
        >
          <Plus className="size-4" />
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <ul className="space-y-1 pr-2">
          {notebooks.map((notebook) => (
            <li key={notebook.id}>
              <div
                className={cn(
                  "group flex items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors",
                  notebook.id === activeNotebook?.id
                    ? "bg-primary/10 text-foreground"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                <button
                  type="button"
                  onClick={() => selectNotebook(notebook.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <BookOpen className="size-4 shrink-0" />
                  <span className="truncate">{notebook.name}</span>
                </button>
                <button
                  type="button"
                  aria-label={`Eliminar ${notebook.name}`}
                  onClick={() => {
                    if (
                      !window.confirm(
                        `¿Eliminar el cuaderno «${notebook.name}» y todas sus fuentes?`,
                      )
                    )
                      return;
                    void removeNotebook(notebook.id);
                  }}
                  className="rounded p-1 opacity-70 transition-opacity hover:opacity-100 focus-visible:opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100"
                >
                  <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
                </button>
              </div>
            </li>
          ))}
          {!notebooks.length && (
            <li className="px-2 py-6 text-center text-xs text-muted-foreground">
              Crea tu primer cuaderno para empezar.
            </li>
          )}
        </ul>
      </ScrollArea>
    </div>
  );
}
