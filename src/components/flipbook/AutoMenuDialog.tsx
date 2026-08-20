import { useEffect, useMemo, useState } from "react";
import { ListTree, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { OutlineEntry } from "@/lib/flipbook/document";
import { makeHotspotId, type Hotspot } from "@/lib/flipbook/hotspots";

interface AutoMenuDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Índice/bookmarks detectados con PDF.js. */
  outline: OutlineEntry[];
  /** Página del flipbook donde se dibujarán los hotspots (1-based). */
  menuPage: number;
  pageCount: number;
  /** Tamaño en puntos PDF de la página del menú. */
  pageSize: { width: number; height: number } | null;
  onCreate: (hotspots: Hotspot[]) => void;
}

/**
 * Reparte una fila clicable por entrada sobre la página del menú.
 * Las coordenadas se generan en puntos PDF, por lo que siguen siendo
 * editables (mover/redimensionar) igual que cualquier hotspot manual.
 */
function buildMenuHotspots(
  entries: OutlineEntry[],
  menuPage: number,
  size: { width: number; height: number },
): Hotspot[] {
  const marginX = size.width * 0.1;
  const top = size.height * 0.18;
  const bottom = size.height * 0.92;
  const available = bottom - top;
  const slot = available / Math.max(entries.length, 1);
  const height = Math.max(14, Math.min(38, slot * 0.8));

  return entries.map((entry, index) => ({
    id: makeHotspotId(),
    page: menuPage,
    x: marginX + Math.min(entry.depth, 3) * (size.width * 0.03),
    y: top + slot * index,
    width: size.width - marginX * 2 - Math.min(entry.depth, 3) * (size.width * 0.03),
    height,
    label: entry.title,
    action: { type: "page", targetPage: entry.page },
  }));
}

export function AutoMenuDialog({
  open,
  onOpenChange,
  outline,
  menuPage,
  pageCount,
  pageSize,
  onCreate,
}: AutoMenuDialogProps) {
  const valid = useMemo(
    () => outline.filter((entry) => entry.page >= 1 && entry.page <= pageCount),
    [outline, pageCount],
  );
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [targetPage, setTargetPage] = useState(String(menuPage));

  useEffect(() => {
    if (!open) return;
    setChecked(Object.fromEntries(valid.map((_, index) => [index, true])));
    setTargetPage(String(menuPage));
  }, [open, valid, menuPage]);

  const selectedCount = valid.filter((_, index) => checked[index]).length;

  const confirm = () => {
    const page = Number(targetPage);
    if (!page || page < 1 || page > pageCount || !pageSize) return;
    const entries = valid.filter((_, index) => checked[index]);
    if (!entries.length) return;
    onCreate(buildMenuHotspots(entries, page, pageSize));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="size-4" /> Crear menú automáticamente
          </DialogTitle>
          <DialogDescription>
            {valid.length
              ? "Se han detectado estas entradas en el índice del PDF. Elige las que quieras convertir en áreas clicables."
              : "Este PDF no incluye marcadores (bookmarks), así que no se puede generar el menú automáticamente."}
          </DialogDescription>
        </DialogHeader>

        {valid.length ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground" htmlFor="auto-menu-page">
                Página del índice donde se crearán los hotspots
              </Label>
              <Input
                id="auto-menu-page"
                type="number"
                min={1}
                max={pageCount}
                value={targetPage}
                onChange={(event) => setTargetPage(event.target.value)}
              />
            </div>

            <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border border-border p-2">
              {valid.map((entry, index) => (
                <label
                  key={`${entry.title}-${index}`}
                  className="flex cursor-pointer items-center gap-3 rounded px-2 py-1.5 text-sm hover:bg-accent"
                  style={{ paddingLeft: `${8 + Math.min(entry.depth, 3) * 12}px` }}
                >
                  <Checkbox
                    checked={!!checked[index]}
                    onCheckedChange={(value) =>
                      setChecked((prev) => ({ ...prev, [index]: value === true }))
                    }
                  />
                  <span className="min-w-0 flex-1 truncate">{entry.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    Página {entry.page}
                  </span>
                </label>
              ))}
            </div>

            <p className="text-xs text-muted-foreground">
              {selectedCount} de {valid.length} entradas seleccionadas. Después podrás mover,
              redimensionar o cambiar el destino de cada área.
            </p>
          </div>
        ) : (
          <div className="flex items-start gap-3 rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            <ListTree className="mt-0.5 size-4 shrink-0" />
            <span>
              Puedes crear el menú a mano con “Añadir hotspot”: dibuja un rectángulo sobre cada
              línea del índice y asígnale su página de destino.
            </span>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {valid.length ? "Cancelar" : "Volver al editor manual"}
          </Button>
          {valid.length > 0 && (
            <Button onClick={confirm} disabled={!selectedCount || !pageSize}>
              Crear {selectedCount} hotspots
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
