import { loadImage } from "./types";

/** How one route is painted: a single color, or a gradient running from the start of the route to its end. */
export type Paint = { kind: "solid"; color: string } | { kind: "gradient"; colors: string[] };

/**
 * The user's route color choice for a set of stickers:
 * - solid: every route the same color
 * - gradient + "each": every route fades start → end through the colors
 * - gradient + "across": route 1 gets the first color, the last route the last color, blended in between
 * - palette: cycle through the colors, one per route
 */
export type RouteStyle = { mode: "solid" | "gradient" | "palette"; colors: string[]; spread: "each" | "across" };

export const STRAVA_ORANGE = "#FC5200";
export const DEFAULT_PAINT: Paint = { kind: "solid", color: STRAVA_ORANGE };
export const DEFAULT_STYLE: RouteStyle = { mode: "solid", colors: [STRAVA_ORANGE], spread: "each" };

export const SOLID_PRESETS = [
  STRAVA_ORANGE,
  "#FFFFFF",
  "#111111",
  "#F5FF3B",
  "#3BFF6F",
  "#22D3EE",
  "#3B82F6",
  "#8B5CF6",
  "#EC4899",
  "#EF4444",
  "#F59E0B",
  "#14B8A6",
];

export const GRADIENT_PRESETS: { name: string; colors: string[] }[] = [
  { name: "Strava", colors: [STRAVA_ORANGE, "#FFD200"] },
  { name: "Sunset", colors: ["#FF5F6D", "#FFC371"] },
  { name: "Ocean", colors: ["#00C6FF", "#0072FF"] },
  { name: "Berry", colors: ["#8B5CF6", "#EC4899"] },
  { name: "Neon", colors: ["#F5FF3B", "#3BFF6F", "#22D3EE"] },
  { name: "Fire", colors: ["#EF4444", "#F59E0B", "#FDE047"] },
  { name: "Mono", colors: ["#FFFFFF", "#6B7280"] },
  { name: "Rainbow", colors: ["#EF4444", "#F59E0B", "#3BFF6F", "#3B82F6", "#8B5CF6"] },
];

export function parseHex(hex: string): [number, number, number] | null {
  const m = hex.trim().replace(/^#/, "");
  const full = m.length === 3 ? m.replace(/./g, (c) => c + c) : m;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}

export const toHex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")}`.toUpperCase();

/** Color at position t (0–1) along a list of color stops. */
export function mix(colors: string[], t: number): string {
  if (colors.length === 1) return colors[0];
  const x = Math.max(0, Math.min(1, t)) * (colors.length - 1);
  const i = Math.min(colors.length - 2, Math.floor(x));
  const a = parseHex(colors[i]) ?? [0, 0, 0];
  const b = parseHex(colors[i + 1]) ?? [0, 0, 0];
  const f = x - i;
  return toHex(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f);
}

/** The paint for route `i` of `n` under a style. */
export function paintFor(style: RouteStyle, i: number, n: number): Paint {
  const cs = style.colors.length ? style.colors : [STRAVA_ORANGE];
  if (style.mode === "solid") return { kind: "solid", color: cs[0] };
  if (style.mode === "palette") return { kind: "solid", color: cs[i % cs.length] };
  if (style.spread === "across") return { kind: "solid", color: mix(cs, n > 1 ? i / (n - 1) : 0) };
  return cs.length > 1 ? { kind: "gradient", colors: cs } : { kind: "solid", color: cs[0] };
}

/** CSS background for previews of a whole style (swatch strip). */
export function styleCss(style: RouteStyle) {
  const cs = style.colors.length ? style.colors : [STRAVA_ORANGE];
  if (style.mode === "solid" || cs.length === 1) return cs[0];
  if (style.mode === "palette") {
    const step = 100 / cs.length;
    return `linear-gradient(90deg, ${cs.map((c, i) => `${c} ${i * step}% ${(i + 1) * step}%`).join(", ")})`;
  }
  return `linear-gradient(90deg, ${cs.join(", ")})`;
}

/** Is this pixel Strava-style orange? (hue ~5–35°, saturated, bright) */
function isOrange(r: number, g: number, b: number) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max < 120 || max - min < 0.55 * max || max !== r) return false;
  const hue = (60 * (g - b)) / (max - min);
  return hue >= 5 && hue <= 35;
}

/**
 * Recolor the orange (route) pixels of an image sticker, e.g. a PNG saved from Strava.
 * Always start from the original image so repeated recolors never degrade it.
 * Gradients run left → right across the sticker.
 */
export async function recolorPixels(img: HTMLImageElement, paint: Paint) {
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height);
  const px = data.data;
  const solid = paint.kind === "solid" ? (parseHex(paint.color) ?? [252, 82, 0]) : null;
  // Precompute gradient colors per column.
  const cols = paint.kind === "gradient" ? Array.from({ length: c.width }, (_, x) => parseHex(mix(paint.colors, x / Math.max(1, c.width - 1)))!) : null;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0 || !isOrange(px[i], px[i + 1], px[i + 2])) continue;
    const [r, g, b] = solid ?? cols![(i / 4) % c.width];
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
  }
  ctx.putImageData(data, 0, 0);
  const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("recolor failed"))), "image/png"));
  return loadImage(blob);
}
