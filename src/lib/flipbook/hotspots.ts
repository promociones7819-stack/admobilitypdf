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
  /** Atajo "Volver al menú": resuelve a la página de menú del documento. */
  | { type: "menu" };

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
  action: HotspotAction;
}

export interface FlipbookConfig {
  version: 1;
  /** Página de inicio/menú del documento (1-based). */
  menuPage: number;
  hotspots: Hotspot[];
}

export const EMPTY_CONFIG: FlipbookConfig = { version: 1, menuPage: 1, hotspots: [] };

const PREFIX = "flipbook-hotspots:";

/** Clave local estable por documento (nombre + tamaño), sin subir nada a ningún sitio. */
export function documentKey(file: { name: string; size: number }): string {
  return `${file.name}::${file.size}`;
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
    hotspots.push({
      id: typeof h.id === "string" ? h.id : makeHotspotId(),
      page: Math.max(1, Math.round(h.page)),
      x: Number(h.x) || 0,
      y: Number(h.y) || 0,
      width: Math.max(1, Number(h.width) || 1),
      height: Math.max(1, Number(h.height) || 1),
      ...(typeof h.label === "string" ? { label: h.label } : {}),
      action:
        action.type === "url"
          ? { type: "url", url: action.url }
          : action.type === "menu"
            ? { type: "menu" }
            : { type: "page", targetPage: Math.max(1, Math.round(action.targetPage)) },
    });
  }
  return {
    version: 1,
    menuPage: Math.max(1, Math.round(Number(data.menuPage) || 1)),
    hotspots,
  };
}

/** Página destino de un hotspot, o null si abre una URL externa. */
export function resolveTargetPage(hotspot: Hotspot, menuPage: number): number | null {
  if (hotspot.action.type === "page") return hotspot.action.targetPage;
  if (hotspot.action.type === "menu") return menuPage;
  return null;
}

export function actionLabel(hotspot: Hotspot, menuPage: number): string {
  if (hotspot.action.type === "url") return hotspot.action.url;
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
