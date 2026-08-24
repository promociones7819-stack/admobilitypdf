import { useEffect, useRef, useState } from "react";
import { Eraser, PenTool, Type, Upload } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { imageDataUrl, readImageAsset, type ImageAsset } from "@/lib/pdf/annotations";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (asset: ImageAsset) => void;
}

async function canvasAsset(canvas: HTMLCanvasElement): Promise<ImageAsset> {
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error("signature-failed"))),
      "image/png",
    ),
  );
  return readImageAsset(new File([blob], "firma.png", { type: "image/png" }));
}

export function SignatureDialog({ open, onOpenChange, onConfirm }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const [mode, setMode] = useState("draw");
  const [name, setName] = useState("");
  const [uploaded, setUploaded] = useState<ImageAsset | null>(null);

  function clearCanvas() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
  }

  useEffect(() => {
    if (open) requestAnimationFrame(clearCanvas);
  }, [open]);

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function begin(event: React.PointerEvent<HTMLCanvasElement>) {
    drawingRef.current = true;
    lastRef.current = point(event);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current || !lastRef.current) return;
    const next = point(event);
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    context.strokeStyle = "#102a43";
    context.lineWidth = Math.max(4, (event.pressure || 0.5) * 12);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    context.moveTo(lastRef.current.x, lastRef.current.y);
    context.lineTo(next.x, next.y);
    context.stroke();
    lastRef.current = next;
  }

  function end() {
    drawingRef.current = false;
    lastRef.current = null;
  }

  async function confirm() {
    if (mode === "upload" && uploaded) {
      onConfirm(uploaded);
      onOpenChange(false);
      return;
    }

    let canvas = canvasRef.current;
    if (mode === "type") {
      await document.fonts?.load('108px "Patrick Hand"');
      canvas = document.createElement("canvas");
      canvas.width = 800;
      canvas.height = 280;
      const context = canvas.getContext("2d");
      if (!context || !name.trim()) return;
      context.fillStyle = "#102a43";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.font = '108px "Patrick Hand", "Comic Sans MS", cursive';
      context.fillText(name.trim(), canvas.width / 2, canvas.height / 2, canvas.width - 48);
    }
    if (!canvas) return;
    onConfirm(await canvasAsset(canvas));
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Crear firma</DialogTitle>
          <DialogDescription>
            Dibuja, escribe o importa tu firma. Se guarda únicamente dentro de este proyecto.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={mode} onValueChange={setMode}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="draw">
              <PenTool className="mr-1.5 size-4" /> Dibujar
            </TabsTrigger>
            <TabsTrigger value="type">
              <Type className="mr-1.5 size-4" /> Escribir
            </TabsTrigger>
            <TabsTrigger value="upload">
              <Upload className="mr-1.5 size-4" /> Importar
            </TabsTrigger>
          </TabsList>

          <TabsContent value="draw" className="space-y-2">
            <canvas
              ref={canvasRef}
              width={800}
              height={280}
              className="h-52 w-full touch-none rounded-lg border border-dashed border-border bg-white"
              aria-label="Zona para dibujar la firma"
              onPointerDown={begin}
              onPointerMove={move}
              onPointerUp={end}
              onPointerCancel={end}
              onPointerLeave={end}
            />
            <Button variant="outline" size="sm" onClick={clearCanvas}>
              <Eraser className="mr-1.5 size-4" /> Borrar dibujo
            </Button>
          </TabsContent>

          <TabsContent value="type" className="space-y-3 py-4">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Escribe tu nombre"
              aria-label="Nombre para la firma"
            />
            <div
              className="flex h-36 items-center justify-center rounded-lg border bg-white px-6 text-center text-6xl text-[#102a43]"
              style={{ fontFamily: '"Patrick Hand", cursive' }}
            >
              {name || "Tu firma"}
            </div>
          </TabsContent>

          <TabsContent value="upload" className="py-4">
            <button
              type="button"
              className="flex min-h-48 w-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-muted/30 p-6 text-sm text-muted-foreground hover:bg-muted/60"
              onClick={() => uploadRef.current?.click()}
            >
              {uploaded ? (
                <img
                  src={imageDataUrl(uploaded)}
                  alt="Firma importada"
                  className="max-h-32 max-w-full object-contain"
                />
              ) : (
                <>
                  <Upload className="size-8" />
                  Elegir una imagen PNG o JPG
                </>
              )}
            </button>
            <input
              ref={uploadRef}
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void readImageAsset(file).then(setUploaded);
              }}
            />
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={(mode === "type" && !name.trim()) || (mode === "upload" && !uploaded)}
            onClick={() => void confirm()}
          >
            Insertar firma
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
