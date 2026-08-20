/**
 * Font catalogue shared by the editor UI and the PDF exporter.
 *
 * - `standard` families map to the PDF base-14 fonts (no embedding needed).
 * - `embedded` families ship as real TTF files in `/public/fonts` and are
 *   embedded (subset) into the exported PDF, so the result looks identical on
 *   any device even if the font is not installed there.
 *
 * Adding a font later only requires a new entry here (+ an `@font-face` rule in
 * `src/styles.css` when it is an embedded family).
 */
export type FontKind = "standard" | "embedded";

export interface FontVariantFiles {
  regular: string;
  bold?: string;
  italic?: string;
  boldItalic?: string;
}

export interface FontDefinition {
  /** Stable id, also used as the CSS family name. */
  family: string;
  label: string;
  kind: FontKind;
  /** CSS font stack used on screen. */
  css: string;
  /** Base-14 group for `standard` fonts. */
  standard?: "Helvetica" | "Times" | "Courier";
  /** TTF urls for `embedded` fonts. */
  files?: FontVariantFiles;
  /** Remote (CDN) TTF urls used when the local file cannot be fetched. */
  cdn?: FontVariantFiles;
}

export const FONT_CATALOG: FontDefinition[] = [
  {
    family: "Helvetica",
    label: "Helvetica",
    kind: "standard",
    standard: "Helvetica",
    css: "Helvetica, Arial, sans-serif",
  },
  {
    family: "Arial",
    label: "Arial",
    kind: "standard",
    standard: "Helvetica",
    css: "Arial, Helvetica, sans-serif",
  },
  {
    family: "Verdana",
    label: "Verdana",
    kind: "standard",
    standard: "Helvetica",
    css: "Verdana, Geneva, sans-serif",
  },
  {
    family: "Trebuchet MS",
    label: "Trebuchet MS",
    kind: "standard",
    standard: "Helvetica",
    css: '"Trebuchet MS", Tahoma, sans-serif',
  },
  {
    family: "Times New Roman",
    label: "Times New Roman",
    kind: "standard",
    standard: "Times",
    css: '"Times New Roman", Times, serif',
  },
  {
    family: "Georgia",
    label: "Georgia",
    kind: "standard",
    standard: "Times",
    css: "Georgia, 'Times New Roman', serif",
  },
  {
    family: "Courier New",
    label: "Courier New",
    kind: "standard",
    standard: "Courier",
    css: '"Courier New", Courier, monospace',
  },
  {
    family: "Inter",
    label: "Inter",
    kind: "embedded",
    css: "Inter, system-ui, sans-serif",
    files: { regular: "/fonts/Inter-Regular.ttf" },
  },
  {
    family: "Roboto",
    label: "Roboto",
    kind: "embedded",
    css: "Roboto, system-ui, sans-serif",
    files: { regular: "/fonts/Roboto-Regular.ttf" },
  },
  {
    family: "Open Sans",
    label: "Open Sans",
    kind: "embedded",
    css: '"Open Sans", system-ui, sans-serif',
    files: { regular: "/fonts/OpenSans-Regular.ttf" },
  },
  {
    family: "Lato",
    label: "Lato",
    kind: "embedded",
    css: "Lato, system-ui, sans-serif",
    files: { regular: "/fonts/Lato-Regular.ttf", bold: "/fonts/Lato-Bold.ttf" },
  },
  {
    family: "Patrick Hand",
    label: "Patrick Hand",
    kind: "embedded",
    css: '"Patrick Hand", "Comic Sans MS", cursive',
    files: { regular: "/fonts/PatrickHand-Regular.ttf" },
  },
];

export const DEFAULT_FONT_FAMILY = "Helvetica";

export function findFont(family: string | undefined): FontDefinition {
  return (
    FONT_CATALOG.find((f) => f.family === family) ??
    FONT_CATALOG.find((f) => f.family === DEFAULT_FONT_FAMILY)!
  );
}

/** CSS stack for a family name, safe for unknown/legacy values. */
export function fontCss(family: string | undefined): string {
  return findFont(family).css;
}

/** Picks the TTF url that best matches the requested weight/style. */
export function embeddedFontUrl(def: FontDefinition, bold: boolean, italic: boolean) {
  const files = def.files;
  if (!files) return null;
  if (bold && italic) return files.boldItalic ?? files.bold ?? files.italic ?? files.regular;
  if (bold) return files.bold ?? files.regular;
  if (italic) return files.italic ?? files.regular;
  return files.regular;
}
