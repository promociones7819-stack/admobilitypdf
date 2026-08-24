import { makeId } from "./types";
import { DEFAULT_FONT_FAMILY } from "./fonts";

/** Annotation kinds available in the editor. */
export type AnnotationKind =
  | "text"
  | "highlight"
  | "underline"
  | "strike"
  | "ink"
  | "line"
  | "arrow"
  | "rect"
  | "ellipse"
  | "image"
  | "signature"
  /** Study strip ("Tira"): hides content until revealed. Never alters the PDF. */
  | "studyCover";

export type ToolId = "select" | AnnotationKind;

export interface Point {
  x: number;
  y: number;
  /** Normalized pointer pressure (0..1) when the device reports it. */
  p?: number;
}

export type TextAlign = "left" | "center" | "right" | "justify";

/**
 * An annotation placed on a working page.
 *
 * Geometry is stored in *normalized display coordinates* (0..1) relative to the
 * page as the user sees it (i.e. including intrinsic + user rotation), with the
 * origin at the top-left and `y` growing downwards. Sizes expressed in points
 * (fontSize, strokeWidth) refer to the page at 100% zoom.
 */
export interface Annotation {
  id: string;
  pageId: string;
  kind: AnnotationKind;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  opacity: number;
  strokeWidth: number;
  filled: boolean;
  text?: string;
  fontSize?: number;
  /** Text styling (kind === "text"). */
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  points?: Point[];
  imageId?: string;
  /** Keeps image/signature proportions while resizing. */
  lockAspect?: boolean;
  /** Font family name from the font catalogue (kind === "text"). */
  fontFamily?: string;
  align?: TextAlign;
  /** Study strip state: false hides the content underneath. */
  revealed?: boolean;
}

export interface ImageAsset {
  id: string;
  mime: "image/png" | "image/jpeg";
  bytes: Uint8Array;
  width: number;
  height: number;
}

export interface AnnotationStyle {
  color: string;
  opacity: number;
  strokeWidth: number;
  /** Independent, much wider thickness range for the highlighter. */
  highlightWidth: number;
  fontSize: number;
  fontFamily: string;
  align: TextAlign;
  filled: boolean;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  /** Use pointer pressure (Apple Pencil / stylus) to modulate stroke width. */
  pressure: boolean;
}

export const DEFAULT_STYLE: AnnotationStyle = {
  color: "#e11d48",
  opacity: 1,
  strokeWidth: 2,
  highlightWidth: 14,
  fontSize: 16,
  fontFamily: DEFAULT_FONT_FAMILY,
  align: "left",
  filled: false,
  bold: false,
  italic: false,
  underline: false,
  pressure: true,
};

export const HIGHLIGHT_PRESETS = [
  { label: "Muy fino", value: 4 },
  { label: "Fino", value: 8 },
  { label: "Medio", value: 14 },
  { label: "Grueso", value: 24 },
  { label: "Muy grueso", value: 36 },
];

export const FONT_SIZE_PRESETS = [10, 12, 14, 16, 20, 24, 32, 48, 64];

/** Tools drawn as a free stroke instead of a box. */
export const STROKE_KINDS: AnnotationKind[] = ["ink", "highlight"];

export const MIN_STROKE = 1;
export const MAX_STROKE = 40;

export const MARKER_KINDS: AnnotationKind[] = ["underline", "strike"];

export const TOOL_LABELS: Record<ToolId, string> = {
  select: "Seleccionar",
  text: "Texto",
  highlight: "Resaltar",
  underline: "Subrayar",
  strike: "Tachar",
  ink: "Dibujo a mano",
  line: "Línea",
  arrow: "Flecha",
  rect: "Rectángulo",
  ellipse: "Elipse",
  image: "Imagen",
  signature: "Firma",
  studyCover: "Tira",
};

export const PALETTE = [
  "#e11d48",
  "#f59e0b",
  "#facc15",
  "#22c55e",
  "#0ea5e9",
  "#6366f1",
  "#111827",
  "#ffffff",
];

export function styleDefaultsFor(kind: AnnotationKind, style: AnnotationStyle) {
  if (kind === "highlight")
    return {
      color: style.color === "#e11d48" ? "#facc15" : style.color,
      opacity: Math.min(style.opacity, 0.45),
      filled: true,
      strokeWidth: style.highlightWidth,
    };
  if (kind === "studyCover") return { color: "#1f2937", opacity: 1, filled: true, strokeWidth: 0 };
  if (kind === "underline" || kind === "strike")
    return { color: style.color, opacity: 1, filled: false, strokeWidth: style.strokeWidth };
  return {
    color: style.color,
    opacity: style.opacity,
    filled: style.filled,
    strokeWidth: style.strokeWidth,
  };
}

export function createAnnotation(
  kind: AnnotationKind,
  pageId: string,
  geometry: { x: number; y: number; width: number; height: number },
  style: AnnotationStyle,
  extra: Partial<Annotation> = {},
): Annotation {
  const resolved = styleDefaultsFor(kind, style);
  return {
    id: makeId("ann"),
    pageId,
    kind,
    ...geometry,
    color: resolved.color,
    opacity: resolved.opacity,
    strokeWidth: resolved.strokeWidth,
    filled: resolved.filled,
    ...(kind === "studyCover" ? { revealed: false } : {}),
    ...(kind === "text"
      ? {
          fontFamily: style.fontFamily,
          align: style.align,
          fontSize: style.fontSize,
          bold: style.bold,
          italic: style.italic,
          underline: style.underline,
        }
      : {}),

    ...extra,
  };
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const value = Number.parseInt(full || "000000", 16);
  return {
    r: ((value >> 16) & 255) / 255,
    g: ((value >> 8) & 255) / 255,
    b: (value & 255) / 255,
  };
}

/**
 * Maps a normalized display point to PDF user-space coordinates of the
 * *unrotated* page box. `rotation` is the total rotation the viewer applies.
 */
export function mapDisplayPoint(
  u: number,
  v: number,
  pageWidth: number,
  pageHeight: number,
  rotation: number,
): { x: number; y: number } {
  switch (rotation) {
    case 90:
      return { x: v * pageWidth, y: u * pageHeight };
    case 180:
      return { x: (1 - u) * pageWidth, y: v * pageHeight };
    case 270:
      return { x: (1 - v) * pageWidth, y: (1 - u) * pageHeight };
    default:
      return { x: u * pageWidth, y: (1 - v) * pageHeight };
  }
}

/** Display box size in points for a page with the given total rotation. */
export function displaySize(pageWidth: number, pageHeight: number, rotation: number) {
  return rotation % 180 === 90
    ? { width: pageHeight, height: pageWidth }
    : { width: pageWidth, height: pageHeight };
}

export async function readImageAsset(file: File): Promise<ImageAsset> {
  if (!/^image\/(png|jpeg)$/.test(file.type)) throw new Error("unsupported-image");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const url = URL.createObjectURL(file);
  try {
    const size = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error("unsupported-image"));
      img.src = url;
    });
    return {
      id: makeId("img"),
      mime: file.type as ImageAsset["mime"],
      bytes,
      width: size.width,
      height: size.height,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function imageDataUrl(asset: ImageAsset): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < asset.bytes.length; i += chunk) {
    binary += String.fromCharCode(...asset.bytes.subarray(i, i + chunk));
  }
  return `data:${asset.mime};base64,${btoa(binary)}`;
}
