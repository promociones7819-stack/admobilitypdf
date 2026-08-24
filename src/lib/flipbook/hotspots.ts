/**
 * Hotspots interactivos del flipbook.
 *
 * Las coordenadas se guardan SIEMPRE en puntos de la página PDF original
 * (mismo espacio que `pageWidth`/`pageHeight` del documento, origen arriba-izquierda).
 * En pantalla se convierten a porcentajes, así que siguen correctas con zoom,
 * cambio de tamaño de ventana o vista móvil.
 */

export type HotspotAction =
  | { type: "page"; targetPage: number }
  | { type: "url"; url: string }
  | { type: "popup"; title: string; text: string }
  | { type: "media"; mediaType: "video" | "audio" | "image"; src: string; title?: string }
  /** Atajo "Volver al menú": resuelve a la página de menú del documento. */
  | { type: "menu" };

export type HotspotButtonPreset =
  "circle" | "square" | "arrow-left" | "arrow-right" | "arrow-up" | "arrow-down" | "ad-mobility";

export interface Hotspot {
  id: string;
  /** Página (1-based) en la que vive el hotspot. */
  page: number;
  /** Puntos PDF, origen arriba-izquierda. */
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
  /** Apariencia visible opcional. Sin valor, el hotspot es invisible. */
  buttonPreset?: HotspotButtonPreset;
  style?: {
    background?: string;
    color?: string;
    radius?: number;
    animation?: "none" | "pulse" | "bounce" | "float";
  };
  action: HotspotAction;
}

export interface FlipbookConfig {
  version: 1;
  /** Página de inicio/menú del documento (1-based). */
  menuPage: number;
  hotspots: Hotspot[];
  theme?: {
    background?: string;
    accent?: string;
    sound?: boolean;
  };
  outline?: Array<{ title: string; page: number; depth: number }>;
}

export const EMPTY_CONFIG: FlipbookConfig = { version: 1, menuPage: 1, hotspots: [] };

const PREFIX = "flipbook-hotspots:";

/** Clave local estable por documento, sin subir nada a ningún sitio. */
export function documentKey(file: { name: string; size: number; lastModified?: number }): string {
  return `${file.name}::${file.size}::${file.lastModified ?? 0}`;
}

export function makeHotspotId(): string {
  return `hs_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36)}`;
}

export function loadConfig(key: string): FlipbookConfig {
  if (typeof localStorage === "undefined") return EMPTY_CONFIG;
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return EMPTY_CONFIG;
    return normalizeConfig(JSON.parse(raw));
  } catch (error) {
    console.warn("[flipbook] configuración local ilegible", error);
    return EMPTY_CONFIG;
  }
}

export function saveConfig(key: string, config: FlipbookConfig): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(config));
  } catch (error) {
    console.warn("[flipbook] no se pudo guardar la configuración", error);
  }
}

/** Valida/normaliza una configuración importada desde JSON. */
export function normalizeConfig(input: unknown): FlipbookConfig {
  const data = (input ?? {}) as Partial<FlipbookConfig> & { hotspots?: unknown };
  const list = Array.isArray(data.hotspots) ? data.hotspots : [];
  const hotspots: Hotspot[] = [];
  for (const item of list) {
    const h = item as Partial<Hotspot> & { action?: HotspotAction };
    if (typeof h?.page !== "number" || !h.action) continue;
    const action = h.action;
    if (action.type === "page" && typeof action.targetPage !== "number") continue;
    if (action.type === "url" && typeof action.url !== "string") continue;
    if (action.type === "popup" && typeof action.text !== "string") continue;
    if (action.type === "media" && typeof action.src !== "string") continue;
    if (action.type === "media" && !safeMediaSource(action.src, action.mediaType)) continue;
    const rawStyle = h.style && typeof h.style === "object" ? h.style : undefined;
    const style: Hotspot["style"] | undefined = rawStyle
      ? {
          ...(safeCssColor(rawStyle.background) ? { background: rawStyle.background } : {}),
          ...(safeCssColor(rawStyle.color) ? { color: rawStyle.color } : {}),
          ...(Number.isFinite(rawStyle.radius)
            ? { radius: Math.min(999, Math.max(0, Number(rawStyle.radius))) }
            : {}),
          ...(["none", "pulse", "bounce", "float"].includes(rawStyle.animation ?? "")
            ? { animation: rawStyle.animation }
            : {}),
        }
      : undefined;
    hotspots.push({
      id: typeof h.id === "string" ? h.id : makeHotspotId(),
      page: Math.max(1, Math.round(h.page)),
      x: Number(h.x) || 0,
      y: Number(h.y) || 0,
      width: Math.max(1, Number(h.width) || 1),
      height: Math.max(1, Number(h.height) || 1),
      ...(typeof h.label === "string" ? { label: h.label } : {}),
      ...(style && Object.keys(style).length ? { style } : {}),
      ...((
        [
          "circle",
          "square",
          "arrow-left",
          "arrow-right",
          "arrow-up",
          "arrow-down",
          "ad-mobility",
        ] as const
      ).includes(h.buttonPreset as HotspotButtonPreset)
        ? { buttonPreset: h.buttonPreset as HotspotButtonPreset }
        : {}),
      action:
        action.type === "url"
          ? { type: "url", url: action.url }
          : action.type === "popup"
            ? { type: "popup", title: action.title ?? "Información", text: action.text }
            : action.type === "media"
              ? {
                  type: "media",
                  mediaType: ["video", "audio", "image"].includes(action.mediaType)
                    ? action.mediaType
                    : "video",
                  src: action.src,
                  ...(action.title ? { title: action.title } : {}),
                }
              : action.type === "menu"
                ? { type: "menu" }
                : { type: "page", targetPage: Math.max(1, Math.round(action.targetPage)) },
    });
  }
  return {
    version: 1,
    menuPage: Math.max(1, Math.round(Number(data.menuPage) || 1)),
    hotspots,
    ...(data.theme && typeof data.theme === "object"
      ? {
          theme: {
            ...(safeCssColor(data.theme.background) ? { background: data.theme.background } : {}),
            ...(safeCssColor(data.theme.accent) ? { accent: data.theme.accent } : {}),
            ...(typeof data.theme.sound === "boolean" ? { sound: data.theme.sound } : {}),
          },
        }
      : {}),
    ...(Array.isArray(data.outline)
      ? {
          outline: data.outline
            .filter((item) => item && typeof item.title === "string")
            .map((item) => ({
              title: item.title,
              page: Math.max(1, Math.round(Number(item.page) || 1)),
              depth: Math.max(0, Math.round(Number(item.depth) || 0)),
            })),
        }
      : {}),
  };
}

function safeCssColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{3,8}$/i.test(value.trim());
}

/** Multimedia local embebida o URL web segura. */
export function safeMediaSource(raw: string, mediaType?: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  const expected = mediaType === "image" ? "image" : mediaType === "audio" ? "audio" : "video";
  return new RegExp(`^data:${expected}/[a-z0-9.+-]+(?:;[^,]*)?,`, "i").test(value) ? value : null;
}

export function buttonPresetGlyph(preset: HotspotButtonPreset): string {
  if (preset === "ad-mobility") return "AD";
  if (preset === "arrow-left") return "←";
  if (preset === "arrow-right") return "→";
  if (preset === "arrow-up") return "↑";
  if (preset === "arrow-down") return "↓";
  if (preset === "circle") return "●";
  return "■";
}

/** Página destino de un hotspot, o null si abre una URL externa. */
export function resolveTargetPage(hotspot: Hotspot, menuPage: number): number | null {
  if (hotspot.action.type === "page") return hotspot.action.targetPage;
  if (hotspot.action.type === "menu") return menuPage;
  return null;
}

export function actionLabel(hotspot: Hotspot, menuPage: number): string {
  if (hotspot.action.type === "url") return hotspot.action.url;
  if (hotspot.action.type === "popup") return `Ventana: ${hotspot.action.title}`;
  if (hotspot.action.type === "media")
    return `${hotspot.action.mediaType}: ${hotspot.action.title || "multimedia"}`;
  if (hotspot.action.type === "menu") return `Volver al menú (página ${menuPage})`;
  return `Página ${hotspot.action.targetPage}`;
}

/** Solo permitimos esquemas seguros para los enlaces externos. */
export function safeExternalUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withScheme);
    if (!["http:", "https:", "mailto:", "tel:"].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}
