import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { OutlineEntry } from "@/lib/flipbook/document";

export function OutlineEditorDialog({
  open,
  onOpenChange,
  entries,
  pageCount,
  onSave,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  entries: OutlineEntry[];
  pageCount: number;
  onSave: (entries: OutlineEntry[]) => void;
}) {
  const [items, setItems] = useState<OutlineEntry[]>(entries);
  useEffect(() => {
    if (open) setItems(entries.map((item) => ({ ...item })));
  }, [entries, open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>Editar índice del flipbook</DialogTitle>
        </DialogHeader>
        <div className="max-h-[58vh] space-y-2 overflow-y-auto pr-1">
          {items.map((item, index) => (
            <div key={index} className="grid grid-cols-[1fr_90px_80px_auto] gap-2">
              <Input
                value={item.title}
                aria-label="Título"
                onChange={(event) =>
                  setItems((current) =>
                    current.map((entry, i) =>
                      i === index ? { ...entry, title: event.target.value } : entry,
                    ),
                  )
                }
              />
              <Input
                type="number"
                min={1}
                max={pageCount}
                value={item.page}
                aria-label="Página"
                onChange={(event) =>
                  setItems((current) =>
                    current.map((entry, i) =>
                      i === index
                        ? {
                            ...entry,
                            page: Math.min(pageCount, Math.max(1, Number(event.target.value) || 1)),
                          }
                        : entry,
                    ),
                  )
                }
              />
              <Input
                type="number"
                min={0}
                max={5}
                value={item.depth}
                aria-label="Nivel"
                onChange={(event) =>
                  setItems((current) =>
                    current.map((entry, i) =>
                      i === index
                        ? {
                            ...entry,
                            depth: Math.min(5, Math.max(0, Number(event.target.value) || 0)),
                          }
                        : entry,
                    ),
                  )
                }
              />
              <Button
                size="icon"
                variant="ghost"
                aria-label="Eliminar entrada"
                onClick={() => setItems((current) => current.filter((_, i) => i !== index))}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setItems((current) => [...current, { title: "Nuevo capítulo", page: 1, depth: 0 }])
          }
        >
          <Plus className="mr-2 size-4" />
          Añadir capítulo
        </Button>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => {
              onSave(items.filter((item) => item.title.trim()));
              onOpenChange(false);
            }}
          >
            Guardar índice
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
