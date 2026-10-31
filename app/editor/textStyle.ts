/** How sticker text looks: size relative to the route, metrics layout, font and color. */
export type TextStyle = {
  /** Multiplier on text size (route size stays the same, so text gets bigger relative to it). */
  scale: number;
  /** Run stickers: metrics in a row under the route, stacked under it, or stacked beside it. */
  layout: "row" | "stack" | "side";
  font: FontId;
  color: string;
};

export type FontId = "geist" | "bebas" | "oswald" | "mono" | "serif";

export const FONTS: { id: FontId; label: string; cssVar: string }[] = [
  { id: "geist", label: "Geist", cssVar: "--font-geist-sans" },
  { id: "bebas", label: "Bebas Neue", cssVar: "--font-bebas" },
  { id: "oswald", label: "Oswald", cssVar: "--font-oswald" },
  { id: "mono", label: "Space Mono", cssVar: "--font-space-mono" },
  { id: "serif", label: "Playfair", cssVar: "--font-playfair" },
];

export const SIZES: { label: string; scale: number }[] = [
  { label: "S", scale: 0.8 },
  { label: "M", scale: 1 },
  { label: "L", scale: 1.4 },
  { label: "XL", scale: 1.9 },
];

export const DEFAULT_TEXT: TextStyle = { scale: 1, layout: "row", font: "geist", color: "#FFFFFF" };

/** CSS font-family string for a font (from the next/font CSS variable on <html>). */
export function fontCss(id: FontId) {
  const f = FONTS.find((x) => x.id === id) ?? FONTS[0];
  if (typeof document === "undefined") return "system-ui, sans-serif";
  return getComputedStyle(document.documentElement).getPropertyValue(f.cssVar).trim() || "system-ui, sans-serif";
}

/** Resolve a text style for drawing: the font is loaded first, since canvas won't trigger font downloads. */
export async function resolveText(t: TextStyle = DEFAULT_TEXT) {
  const family = fontCss(t.font);
  try {
    await Promise.all([document.fonts.load(`800 100px ${family}`), document.fonts.load(`500 100px ${family}`)]);
  } catch {}
  await document.fonts?.ready;
  return { family, color: t.color, scale: t.scale, layout: t.layout };
}
