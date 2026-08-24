import { useState } from "react";
import { Layers3, RotateCcw, RotateCw, Scissors } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { usePdfEditor, friendlyError } from "@/lib/pdf/store";
import { pageChunks, parsePageGroups, parsePageRange } from "@/lib/pdf/ranges";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function rangeMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message === "range-outside") return "Hay una página fuera del documento.";
  return "Revisa el rango. Usa un formato como 1-3, 5, 8-10.";
}

export function PageOperationsDialog({ open, onOpenChange }: Props) {
  const { pages, selection, setSelection, setActivePage, rotatePages, splitPages } = usePdfEditor();
  const [range, setRange] = useState("");
  const [splitMode, setSplitMode] = useState<"individual" | "chunks" | "groups">("individual");
  const [chunkSize, setChunkSize] = useState(5);
  const [groups, setGroups] = useState("1-3; 4-6");
  const allIds = pages.map((page) => page.id);
  const targets = selection.length > 0 ? selection : allIds;

  function selectRange() {
    try {
      const ids = parsePageRange(range, pages.length).map((index) => pages[index]!.id);
      if (ids[0]) setActivePage(ids[0]);
      setSelection(ids);
      toast.success(
        `${ids.length} página${ids.length === 1 ? "" : "s"} seleccionada${ids.length === 1 ? "" : "s"}`,
      );
    } catch (error) {
      toast.error(rangeMessage(error));
    }
  }

  async function divide() {
    try {
      let pageGroups: number[][];
      if (splitMode === "individual") pageGroups = pageChunks(pages.length, 1);
      else if (splitMode === "chunks") pageGroups = pageChunks(pages.length, chunkSize);
      else pageGroups = parsePageGroups(groups, pages.length);
      await splitPages(pageGroups.map((group) => group.map((index) => pages[index]!.id)));
      toast.success("PDF dividido y guardado");
    } catch (error) {
      if (error instanceof Error && /range|chunk/.test(error.message)) {
        toast.error(rangeMessage(error));
      } else toast.error(friendlyError(error));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Organizar por rangos</DialogTitle>
          <DialogDescription>
            Selecciona, rota o divide páginas sin abandonar el editor.
          </DialogDescription>
        </DialogHeader>

        <section className="space-y-3 rounded-xl border p-4">
          <div className="flex items-center gap-2 font-medium">
            <Layers3 className="size-4" /> Seleccionar páginas
          </div>
          <div className="flex gap-2">
            <Input
              value={range}
              onChange={(event) => setRange(event.target.value)}
              placeholder="1-3, 5, 8-10"
              aria-label="Rango de páginas"
            />
            <Button variant="outline" onClick={selectRange}>
              Seleccionar
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setSelection(allIds)}>
              Seleccionar todas
            </Button>
            <Button size="sm" variant="outline" onClick={() => setSelection([])}>
              Quitar selección
            </Button>
          </div>
        </section>

        <section className="space-y-3 rounded-xl border p-4">
          <p className="font-medium">
            Rotar {selection.length ? `selección (${selection.length})` : "todas las páginas"}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => rotatePages(targets, -90)}>
              <RotateCcw className="mr-1.5 size-4" /> 90° izquierda
            </Button>
            <Button size="sm" variant="outline" onClick={() => rotatePages(targets, 90)}>
              <RotateCw className="mr-1.5 size-4" /> 90° derecha
            </Button>
            <Button size="sm" variant="outline" onClick={() => rotatePages(targets, 180)}>
              Girar 180°
            </Button>
          </div>
        </section>

        <section className="space-y-3 rounded-xl border p-4">
          <div className="flex items-center gap-2 font-medium">
            <Scissors className="size-4" /> Dividir el PDF
          </div>
          <select
            value={splitMode}
            onChange={(event) => setSplitMode(event.target.value as typeof splitMode)}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            aria-label="Modo de división"
          >
            <option value="individual">Un PDF por página</option>
            <option value="chunks">Grupos del mismo tamaño</option>
            <option value="groups">Grupos personalizados</option>
          </select>
          {splitMode === "chunks" && (
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              Páginas por archivo
              <Input
                className="w-24"
                type="number"
                min={1}
                max={pages.length}
                value={chunkSize}
                onChange={(event) => setChunkSize(Math.max(1, Number(event.target.value) || 1))}
              />
            </label>
          )}
          {splitMode === "groups" && (
            <div className="space-y-1">
              <Input
                value={groups}
                onChange={(event) => setGroups(event.target.value)}
                placeholder="1-3; 4-6; 7,9"
                aria-label="Grupos de páginas"
              />
              <p className="text-xs text-muted-foreground">Separa cada PDF con punto y coma.</p>
            </div>
          )}
          <Button onClick={() => void divide()}>
            <Scissors className="mr-1.5 size-4" /> Dividir y guardar
          </Button>
        </section>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
