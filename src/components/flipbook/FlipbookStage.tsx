import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import type { FlipbookPage } from "@/lib/flipbook/document";
import { resolveTargetPage, type Hotspot } from "@/lib/flipbook/hotspots";

export interface FlipbookHandle {
  /** Navega a una página (1-based) usando la API de StPageFlip, sin recargar el PDF. */
  flipTo: (page: number) => void;
}

interface StageProps {
  pages: FlipbookPage[];
  hotspots: Hotspot[];
  menuPage: number;
  zoom: number;
  onPageChange: (page: number) => void;
  handleRef: Ref<FlipbookHandle>;
}

type PageFlipInstance = {
  loadFromHTML: (items: NodeListOf<Element> | Element[]) => void;
  on: (event: string, cb: (e: { data: number }) => void) => void;
  destroy: () => void;
  flip: (index: number) => void;
  turnToPage: (index: number) => void;
  getCurrentPageIndex: () => number;
};

function buildPageElement(
  page: FlipbookPage,
  hotspots: Hotspot[],
  menuPage: number,
): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "page-container relative overflow-hidden bg-white";
  wrapper.dataset["pageNumber"] = String(page.number);

  const img = document.createElement("img");
  img.src = page.imageUrl;
  img.alt = `Página ${page.number}`;
  img.draggable = false;
  img.style.cssText =
    "position:absolute;inset:0;width:100%;height:100%;object-fit:contain;user-select:none;";
  wrapper.appendChild(img);

  const overlay = document.createElement("div");
  overlay.style.cssText = "position:absolute;inset:0;";

  // Enlaces originales del PDF (internos y externos).
  for (const link of page.links) {
    const a = document.createElement("a");
    a.style.cssText = `position:absolute;top:${link.top}%;left:${link.left}%;width:${link.width}%;height:${link.height}%;`;
    if (link.url) {
      a.href = link.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.dataset["fbAction"] = "url";
    } else {
      a.href = `#page=${link.targetPage}`;
      a.dataset["fbAction"] = "page";
      a.dataset["fbPage"] = String(link.targetPage);
    }
    overlay.appendChild(a);
  }

  // Hotspots del editor: invisibles en modo visualización.
  for (const hotspot of hotspots) {
    const target = resolveTargetPage(hotspot, menuPage);
    const el = document.createElement("a");
    el.style.cssText = `position:absolute;top:${(hotspot.y / page.height) * 100}%;left:${
      (hotspot.x / page.width) * 100
    }%;width:${(hotspot.width / page.width) * 100}%;height:${
      (hotspot.height / page.height) * 100
    }%;cursor:pointer;`;
    el.title = hotspot.label ?? "";
    if (target) {
      el.href = `#page=${target}`;
      el.dataset["fbAction"] = "page";
      el.dataset["fbPage"] = String(target);
    } else if (hotspot.action.type === "url") {
      el.href = hotspot.action.url;
      el.target = "_blank";
      el.rel = "noopener noreferrer";
      el.dataset["fbAction"] = "url";
    }
    overlay.appendChild(el);
  }

  wrapper.appendChild(overlay);
  return wrapper;
}

export function FlipbookStage({
  pages,
  hotspots,
  menuPage,
  zoom,
  onPageChange,
  handleRef,
}: StageProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const flipRef = useRef<PageFlipInstance | null>(null);
  const pageRef = useRef(1);

  useImperativeHandle(handleRef, () => ({
    flipTo: (page: number) => {
      const index = Math.min(Math.max(page, 1), pages.length) - 1;
      const flip = flipRef.current;
      if (!flip) return;
      flip.flip(index);
      pageRef.current = index + 1;
      onPageChange(index + 1);
    },
  }));

  useEffect(() => {
    if (!pages.length) return;
    let cancelled = false;
    let instance: PageFlipInstance | null = null;
    let observer: ResizeObserver | null = null;

    const setup = async () => {
      const { PageFlip } = await import("page-flip");
      const host = hostRef.current;
      if (cancelled || !host) return;

      const first = pages[0]!;
      const aspect = first.width / first.height;

      const build = () => {
        if (!hostRef.current) return;
        const box = hostRef.current.parentElement;
        if (!box) return;
        const single = box.clientWidth < 760;
        const available = {
          width: Math.max(240, box.clientWidth - 24),
          height: Math.max(240, box.clientHeight - 24),
        };
        const spreadAspect = single ? aspect : aspect * 2;
        let width = available.width;
        let height = width / spreadAspect;
        if (height > available.height) {
          height = available.height;
          width = height * spreadAspect;
        }

        instance?.destroy();
        hostRef.current.innerHTML = "";
        hostRef.current.style.width = `${Math.round(width)}px`;
        hostRef.current.style.height = `${Math.round(height)}px`;

        for (const page of pages) {
          const el = buildPageElement(page, hotspots.filter((h) => h.page === page.number), menuPage);
          el.style.width = `${Math.round(single ? width : width / 2)}px`;
          el.style.height = `${Math.round(height)}px`;
          hostRef.current.appendChild(el);
        }

        instance = new (PageFlip as unknown as new (
          el: HTMLElement,
          cfg: Record<string, unknown>,
        ) => PageFlipInstance)(hostRef.current, {
          width: Math.round(single ? width : width / 2),
          height: Math.round(height),
          size: "stretch",
          minWidth: 120,
          maxWidth: 4000,
          minHeight: 120,
          maxHeight: 4000,
          autoSize: false,
          showCover: false,
          usePortrait: single,
          startPage: Math.max(0, pageRef.current - 1),
          drawShadow: true,
          maxShadowOpacity: 0.4,
          flippingTime: 500,
          useMouseEvents: true,
          swipeDistance: 30,
          mobileScrollSupport: false,
        });
        flipRef.current = instance;
        instance.loadFromHTML(hostRef.current.querySelectorAll(".page-container"));
        instance.on("flip", (e) => {
          pageRef.current = e.data + 1;
          onPageChange(e.data + 1);
        });
      };

      build();
      observer = new ResizeObserver(() => build());
      if (host.parentElement) observer.observe(host.parentElement);
    };

    void setup();
    return () => {
      cancelled = true;
      observer?.disconnect();
      try {
        instance?.destroy();
      } catch {
        /* noop */
      }
      flipRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages, hotspots, menuPage]);

  // Clic en enlaces: navegación interna con la API de StPageFlip; URLs en pestaña nueva.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const onClick = (event: MouseEvent) => {
      const target = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-fb-action]");
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      if (target.dataset["fbAction"] === "page") {
        const page = Number(target.dataset["fbPage"]);
        if (page && flipRef.current) {
          flipRef.current.flip(Math.min(Math.max(page, 1), pages.length) - 1);
          pageRef.current = page;
          onPageChange(page);
        }
        return;
      }
      const href = target.getAttribute("href");
      if (href) window.open(href, "_blank", "noopener,noreferrer");
    };
    host.addEventListener("click", onClick, true);
    return () => host.removeEventListener("click", onClick, true);
  }, [onPageChange, pages.length]);

  return (
    <div className="flex flex-1 items-center justify-center overflow-auto p-3">
      <div
        ref={hostRef}
        className="shadow-2xl"
        style={{ transform: `scale(${zoom})`, transformOrigin: "center center" }}
      />
    </div>
  );
}
