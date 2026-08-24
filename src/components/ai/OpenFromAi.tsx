// Consume la petición de apertura generada al pulsar una cita en el chat:
// recupera los bytes del PDF guardados localmente y salta a la página citada.
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { getSourceBytes } from "@/lib/ai/db";
import { onOpenRequest, takePendingOpen, type PendingOpen } from "@/lib/ai/handoff";
import { usePdfEditor } from "@/lib/pdf/store";

export function OpenFromAi({ onDocumentOpened }: { onDocumentOpened?: () => void } = {}) {
  const { openFiles, pages, setActivePage } = usePdfEditor();
  const targetPage = useRef<number | null>(null);
  const handled = useRef(false);

  useEffect(() => {
    let alive = true;
    const openPending = async (pending: PendingOpen) => {
      const bytes = await getSourceBytes(pending.sourceId);
      if (!alive) return;
      if (!bytes) {
        toast.error("Ese documento ya no está disponible en este dispositivo");
        return;
      }
      const copy = new Uint8Array(bytes);
      const file = new File([copy.buffer as ArrayBuffer], pending.name, {
        type: "application/pdf",
      });
      targetPage.current = pending.pageNumber;
      await openFiles([file]);
      onDocumentOpened?.();
      toast.success(`Abriendo ${pending.name} · página ${pending.pageNumber}`);
    };

    if (!handled.current) {
      handled.current = true;
      const pending = takePendingOpen();
      if (pending)
        void openPending(pending).catch(() => toast.error("No se pudo abrir el documento citado"));
    }
    const unsubscribe = onOpenRequest(() => {
      const pending = takePendingOpen();
      if (pending)
        void openPending(pending).catch(() => toast.error("No se pudo abrir el documento citado"));
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [onDocumentOpened, openFiles]);

  // Al terminar de cargar el documento, saltamos a la página de la cita.
  useEffect(() => {
    const page = targetPage.current;
    if (page === null || !pages.length) return;
    const target = pages[Math.min(page, pages.length) - 1];
    if (!target) return;
    targetPage.current = null;
    setActivePage(target.id);
  }, [pages, setActivePage]);

  return null;
}
