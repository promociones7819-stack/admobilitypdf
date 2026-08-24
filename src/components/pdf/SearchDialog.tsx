import { useEffect, useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { usePdfEditor } from "@/lib/pdf/store";

interface SearchResult {
  pageId: string;
  pageNumber: number;
  snippet: string;
  count: number;
}

export function SearchDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { pages, sources, setActivePage } = usePdfEditor();
  const [query, setQuery] = useState("");
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || Object.keys(texts).length === pages.length) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const next: Record<string, string> = {};
      for (const entry of pages) {
        if (entry.blank) {
          next[entry.id] = "";
          continue;
        }
        const source = sources[entry.sourceId];
        if (!source) continue;
        const page = await source.doc.getPage(entry.sourceIndex);
        const content = await page.getTextContent();
        next[entry.id] = content.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
        page.cleanup();
      }
      if (!cancelled) setTexts(next);
    })().finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open, pages, sources, texts]);

  const results = useMemo<SearchResult[]>(() => {
    const needle = query.trim().toLocaleLowerCase("es");
    if (needle.length < 2) return [];
    return pages.flatMap((page, index) => {
      const text = texts[page.id] ?? "";
      const lower = text.toLocaleLowerCase("es");
      const at = lower.indexOf(needle);
      if (at < 0) return [];
      let count = 0;
      let cursor = 0;
      while ((cursor = lower.indexOf(needle, cursor)) >= 0) {
        count += 1;
        cursor += needle.length;
      }
      return [
        {
          pageId: page.id,
          pageNumber: index + 1,
          count,
          snippet: text.slice(Math.max(0, at - 55), Math.min(text.length, at + needle.length + 90)),
        },
      ];
    });
  }, [pages, query, texts]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[82vh] max-w-2xl overflow-hidden p-0">
        <DialogHeader className="border-b p-5 pb-4">
          <DialogTitle>Buscar en todo el documento</DialogTitle>
          <div className="relative pt-2">
            <Search className="absolute left-3 top-5 size-4 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Escribe una palabra o frase"
              className="pl-9"
            />
          </div>
        </DialogHeader>
        <div className="max-h-[58vh] overflow-y-auto p-3">
          {loading ? (
            <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Creando índice local…
            </div>
          ) : query.trim().length < 2 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              Escribe al menos dos caracteres.
            </p>
          ) : results.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">No hay coincidencias.</p>
          ) : (
            <div className="space-y-2">
              {results.map((result) => (
                <button
                  key={result.pageId}
                  className="w-full rounded-xl border p-3 text-left hover:bg-accent"
                  onClick={() => {
                    setActivePage(result.pageId);
                    onOpenChange(false);
                  }}
                >
                  <span className="font-semibold">Página {result.pageNumber}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {result.count} coincidencia(s)
                  </span>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                    …{result.snippet}…
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
