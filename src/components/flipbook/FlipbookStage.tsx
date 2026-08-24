import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import type { FlipbookPage } from "@/lib/flipbook/document";
import { buttonPresetGlyph, resolveTargetPage, type Hotspot } from "@/lib/flipbook/hotspots";

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
  theme?: { background?: string; accent?: string; sound?: boolean };
}

type PageFlipInstance = {
  loadFromHTML: (items: NodeListOf<Element> | Element[]) => void;
  on: (event: string, cb: (e: { data: number }) => void) => void;
  destroy: () => void;
  flip: (index: number) => void;
  turnToPage: (index: number) => void;
  getCurrentPageIndex: () => number;
};

function showInteractiveOverlay(action: Hotspot["action"]) {
  if (action.type !== "popup" && action.type !== "media") return;
  const backdrop = document.createElement("div");
  backdrop.style.cssText =
    "position:fixed;inset:0;z-index:99999;background:rgba(15,23,42,.72);display:grid;place-items:center;padding:24px;";
  const panel = document.createElement("section");
  panel.style.cssText =
    "position:relative;width:min(760px,94vw);max-height:88vh;overflow:auto;border-radius:22px;background:white;padding:24px;box-shadow:0 30px 80px rgba(0,0,0,.4);color:#111827;";
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "×";
  close.setAttribute("aria-label", "Cerrar");
  close.style.cssText =
    "position:absolute;right:12px;top:8px;border:0;background:transparent;font-size:30px;cursor:pointer;";
  close.onclick = () => backdrop.remove();
  panel.appendChild(close);
  const title = document.createElement("h2");
  title.textContent = action.title || (action.type === "popup" ? "Información" : "Multimedia");
  title.style.cssText = "margin:0 36px 16px 0;font:700 22px system-ui;";
  panel.appendChild(title);
  if (action.type === "popup") {
    const text = document.createElement("p");
    text.textContent = action.text;
    text.style.cssText = "white-space:pre-wrap;line-height:1.6;margin:0;";
    panel.appendChild(text);
  } else {
    const media = document.createElement(action.mediaType === "image" ? "img" : action.mediaType);
    media.setAttribute("src", action.src);
    media.setAttribute("controls", "");
    media.style.cssText =
      "display:block;width:100%;max-height:70vh;object-fit:contain;border-radius:12px;";
    panel.appendChild(media);
  }
  backdrop.onclick = (event) => event.target === backdrop && backdrop.remove();
  backdrop.appendChild(panel);
  document.body.appendChild(backdrop);
}

function buildPageElement(
  page: FlipbookPage,
  hotspots: Hotspot[],
  menuPage: number,
  accent?: string,
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
    if (hotspot.style) {
      if (hotspot.style.background) el.style.background = hotspot.style.background;
      if (hotspot.style.color) el.style.color = hotspot.style.color;
      if (typeof hotspot.style.radius === "number")
        el.style.borderRadius = `${hotspot.style.radius}px`;
      if (hotspot.style.animation && hotspot.style.animation !== "none")
        el.style.animation = `fb-${hotspot.style.animation} 1.8s ease-in-out infinite`;
    }
    if (hotspot.buttonPreset) {
      el.className = `flipbook-3d-button${hotspot.buttonPreset.startsWith("arrow-") ? " flipbook-3d-arrow" : ""}`;
      if (!hotspot.style?.background && accent) el.style.background = accent;
      el.style.borderRadius = hotspot.buttonPreset === "circle" ? "999px" : "14px";
      if (hotspot.buttonPreset === "ad-mobility") {
        el.classList.add("flipbook-3d-brand");
        const logo = document.createElement("img");
        logo.src = "/brand/ad-mobility.png";
        logo.alt = "AD Mobility";
        logo.style.cssText = "width:100%;height:100%;object-fit:contain;pointer-events:none;";
        el.appendChild(logo);
      } else {
        el.textContent = buttonPresetGlyph(hotspot.buttonPreset);
      }
      el.setAttribute("aria-label", hotspot.label || "Abrir hipervínculo");
    }
    if (target) {
      el.href = `#page=${target}`;
      el.dataset["fbAction"] = "page";
      el.dataset["fbPage"] = String(target);
    } else if (hotspot.action.type === "url") {
      el.href = hotspot.action.url;
      el.target = "_blank";
      el.rel = "noopener noreferrer";
      el.dataset["fbAction"] = "url";
    } else if (hotspot.action.type === "popup" || hotspot.action.type === "media") {
      el.href = "#interactive";
      el.dataset["fbAction"] = "interactive";
      el.dataset["fbPayload"] = JSON.stringify(hotspot.action);
    }
    overlay.appendChild(el);
  }

  wrapper.appendChild(overlay);

  // El punto de agarre está en el centro del canto exterior, como en un libro real.
  const edge = document.createElement("button");
  const isLeftPage = page.number % 2 === 0;
  edge.type = "button";
  edge.dataset["fbAction"] = "turn";
  edge.dataset["fbDelta"] = isLeftPage ? "-1" : "1";
  edge.setAttribute(
    "aria-label",
    isLeftPage ? "Pasar a la página anterior" : "Pasar a la página siguiente",
  );
  edge.title = "Arrastra o pulsa para pasar la hoja";
  edge.style.cssText = `position:absolute;z-index:20;top:50%;${isLeftPage ? "left:0" : "right:0"};width:36px;height:100px;transform:translateY(-50%);border:0;cursor:grab;touch-action:none;background:linear-gradient(${isLeftPage ? "90deg" : "270deg"},rgba(15,23,42,.22),transparent);opacity:.55;transition:opacity .2s;`;
  edge.addEventListener("mouseenter", () => (edge.style.opacity = "1"));
  edge.addEventListener("mouseleave", () => (edge.style.opacity = ".55"));
  wrapper.appendChild(edge);
  return wrapper;
}

export function FlipbookStage({
  pages,
  hotspots,
  menuPage,
  zoom,
  onPageChange,
  handleRef,
  theme,
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
    let resizeTimer = 0;

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

        try {
          instance?.destroy();
        } catch {
          /* noop */
        }
        // PageFlip toma el control total del nodo que recibe: usamos un nodo
        // interno propio para que React nunca compita por el mismo elemento.
        hostRef.current.innerHTML = "";
        hostRef.current.style.width = `${Math.round(width)}px`;
        hostRef.current.style.height = `${Math.round(height)}px`;
        const mount = document.createElement("div");
        mount.style.cssText = `width:${Math.round(width)}px;height:${Math.round(height)}px;`;
        hostRef.current.appendChild(mount);

        for (const page of pages) {
          const el = buildPageElement(
            page,
            hotspots.filter((h) => h.page === page.number),
            menuPage,
            theme?.accent,
          );
          el.style.width = `${Math.round(single ? width : width / 2)}px`;
          el.style.height = `${Math.round(height)}px`;
          mount.appendChild(el);
        }

        instance = new (
          PageFlip as unknown as new (
            el: HTMLElement,
            cfg: Record<string, unknown>,
          ) => PageFlipInstance
        )(mount, {
          width: Math.round(single ? width : width / 2),
          height: Math.round(height),
          size: "fixed",
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
          useMouseEvents: false,
          swipeDistance: 30,
          mobileScrollSupport: false,
        });
        flipRef.current = instance;
        instance.loadFromHTML(mount.querySelectorAll(".page-container"));
        instance.on("flip", (e) => {
          pageRef.current = e.data + 1;
          onPageChange(e.data + 1);
          if (theme?.sound) {
            try {
              const AudioContextClass =
                window.AudioContext ||
                (window as typeof window & { webkitAudioContext?: typeof AudioContext })
                  .webkitAudioContext;
              if (AudioContextClass) {
                const audio = new AudioContextClass();
                const oscillator = audio.createOscillator();
                const gain = audio.createGain();
                oscillator.frequency.setValueAtTime(150, audio.currentTime);
                oscillator.frequency.exponentialRampToValueAtTime(70, audio.currentTime + 0.08);
                gain.gain.setValueAtTime(0.025, audio.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.09);
                oscillator.connect(gain).connect(audio.destination);
                oscillator.start();
                oscillator.stop(audio.currentTime + 0.1);
                window.setTimeout(() => void audio.close(), 180);
              }
            } catch {
              /* audio opcional */
            }
          }
        });
      };

      build();
      observer = new ResizeObserver(() => {
        window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(build, 120);
      });
      if (host.parentElement) observer.observe(host.parentElement);
    };

    void setup();
    return () => {
      cancelled = true;
      window.clearTimeout(resizeTimer);
      observer?.disconnect();
      try {
        instance?.destroy();
      } catch {
        /* noop */
      }
      flipRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages, hotspots, menuPage, theme?.sound]);

  // Clic en enlaces: navegación interna con la API de StPageFlip; URLs en pestaña nueva.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let drag: { x: number; target: HTMLElement } | null = null;
    let suppressClick = false;
    const turn = (target: HTMLElement) => {
      const delta = Number(target.dataset["fbDelta"] ?? 0);
      const next = Math.min(Math.max(pageRef.current + delta, 1), pages.length);
      if (next !== pageRef.current && flipRef.current) {
        flipRef.current.flip(next - 1);
        pageRef.current = next;
        onPageChange(next);
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = (event.target as HTMLElement | null)?.closest<HTMLElement>(
        '[data-fb-action="turn"]',
      );
      if (!target) return;
      event.preventDefault();
      drag = { x: event.clientX, target };
      target.setPointerCapture?.(event.pointerId);
      target.style.cursor = "grabbing";
    };
    const onPointerUp = (event: PointerEvent) => {
      if (!drag) return;
      const moved = Math.abs(event.clientX - drag.x);
      drag.target.style.cursor = "grab";
      if (moved >= 14) {
        event.preventDefault();
        suppressClick = true;
        turn(drag.target);
      }
      drag = null;
    };
    const onClick = (event: MouseEvent) => {
      const target = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-fb-action]");
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      if (suppressClick) {
        suppressClick = false;
        return;
      }
      if (target.dataset["fbAction"] === "page") {
        const page = Number(target.dataset["fbPage"]);
        if (page && flipRef.current) {
          flipRef.current.flip(Math.min(Math.max(page, 1), pages.length) - 1);
          pageRef.current = page;
          onPageChange(page);
        }
        return;
      }
      if (target.dataset["fbAction"] === "turn") {
        turn(target);
        return;
      }
      if (target.dataset["fbAction"] === "interactive") {
        try {
          showInteractiveOverlay(
            JSON.parse(target.dataset["fbPayload"] ?? "{}") as Hotspot["action"],
          );
        } catch {
          /* configuración dañada: no hacemos nada */
        }
        return;
      }
      const href = target.getAttribute("href");
      if (href) window.open(href, "_blank", "noopener,noreferrer");
    };
    host.addEventListener("pointerdown", onPointerDown, true);
    host.addEventListener("pointerup", onPointerUp, true);
    host.addEventListener("pointercancel", onPointerUp, true);
    host.addEventListener("click", onClick, true);
    return () => {
      host.removeEventListener("pointerdown", onPointerDown, true);
      host.removeEventListener("pointerup", onPointerUp, true);
      host.removeEventListener("pointercancel", onPointerUp, true);
      host.removeEventListener("click", onClick, true);
    };
  }, [onPageChange, pages.length]);

  return (
    <div
      className="flex flex-1 items-center justify-center overflow-auto p-3"
      style={{ background: theme?.background }}
    >
      <div
        ref={hostRef}
        className="shadow-2xl"
        style={{ transform: `scale(${zoom})`, transformOrigin: "center center" }}
      />
    </div>
  );
}
