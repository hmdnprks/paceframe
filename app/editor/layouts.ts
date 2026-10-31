import type { Transform } from "./types";

type Box = { nw: number; nh: number };
type Rect = { x: number; y: number; w: number; h: number };

export type LayoutId = "stack" | "corner" | "grid" | "arc" | "row" | "circle" | "hero" | "scatter";

export const LAYOUTS: { id: LayoutId; label: string; hint: string }[] = [
  { id: "stack", label: "Stack", hint: "Centered column" },
  { id: "corner", label: "Corner", hint: "Bottom-left, Strava style" },
  { id: "grid", label: "Grid", hint: "Pick columns" },
  { id: "arc", label: "Arc", hint: "Curved rows, adjustable" },
  { id: "row", label: "Bottom bar", hint: "Row along the bottom" },
  { id: "circle", label: "Circle", hint: "Ring around center" },
  { id: "hero", label: "Hero", hint: "First big, rest below" },
  { id: "scatter", label: "Scatter", hint: "Random, tilted" },
];

const fit = (b: Box, maxW: number, maxH: number) => Math.min(maxW / b.nw, maxH / b.nh, 4);

/** Area kept clear of Instagram's top bar and reply box. */
function safeArea(W: number, H: number): Rect {
  const story = H / W > 1.5;
  const top = story ? H * 0.13 : H * 0.06;
  const bottom = story ? H * 0.82 : H * 0.94;
  return { x: W * 0.06, y: top, w: W * 0.88, h: bottom - top };
}

function column(items: Box[], area: Rect, maxW: number, align: "center" | "left", anchor: "center" | "bottom"): Transform[] {
  const gap = area.h * 0.02;
  let scales = items.map((b) => fit(b, maxW, area.h));
  const total = (s: number[]) => s.reduce((sum, sc, i) => sum + items[i].nh * sc, 0) + gap * (items.length - 1);
  const t = total(scales);
  if (t > area.h) scales = scales.map((s) => (s * (area.h - gap * (items.length - 1))) / (t - gap * (items.length - 1)));
  let y = anchor === "center" ? area.y + (area.h - total(scales)) / 2 : area.y + area.h - total(scales);
  return items.map((b, i) => {
    const w = b.nw * scales[i];
    const h = b.nh * scales[i];
    const x = align === "center" ? area.x + area.w / 2 : area.x + w / 2;
    const out = { x, y: y + h / 2, scale: scales[i], rotation: 0 };
    y += h + gap;
    return out;
  });
}

function grid(items: Box[], area: Rect, cols: number, maxCell: number, anchor: "center" | "bottom" = "center"): Transform[] {
  const rows = Math.ceil(items.length / cols);
  const gap = area.w * 0.03;
  const cw = (area.w - gap * (cols - 1)) / cols;
  // Rows are only as tall as the tallest sticker needs, so wide/short stickers sit close together.
  const tallest = Math.max(...items.map((b) => b.nh * fit(b, cw * 0.95, maxCell * 0.95))) / 0.95;
  const ch = Math.min((area.h - gap * (rows - 1)) / rows, maxCell, tallest);
  const gridH = rows * ch + gap * (rows - 1);
  const top = anchor === "center" ? area.y + (area.h - gridH) / 2 : area.y + area.h - gridH;
  return items.map((b, i) => {
    const r = Math.floor(i / cols);
    const inRow = Math.min(cols, items.length - r * cols);
    const rowW = inRow * cw + gap * (inRow - 1);
    const c = i % cols;
    return {
      x: area.x + (area.w - rowW) / 2 + c * (cw + gap) + cw / 2,
      y: top + r * (ch + gap) + ch / 2,
      scale: fit(b, cw * 0.95, ch * 0.95),
      rotation: 0,
    };
  });
}

export type LayoutOptions = {
  cols?: number;
  /** Arc sweep in degrees: positive bulges up (∩), negative curves down (∪). */
  bend?: number;
  /** Rotate stickers to follow the arc. */
  tilt?: boolean;
  rand?: () => number;
};

/** Layouts that open the tuning panel (columns, bend…) after being applied. */
export const TUNABLE: LayoutId[] = ["grid", "arc"];
export const DEFAULT_BEND = 100;

export const MAX_COLS = 8;
export const defaultCols = (n: number) => (n > 6 ? 3 : Math.min(n, 2));

/** Uniformly shrink (never grow) a placement so its bounds fit the area, then center it there. */
function fitInto(items: Box[], t: Transform[], area: Rect): Transform[] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  t.forEach((p, i) => {
    const r = (p.rotation * Math.PI) / 180;
    const hw = (items[i].nw * p.scale) / 2;
    const hh = (items[i].nh * p.scale) / 2;
    const ex = hw * Math.abs(Math.cos(r)) + hh * Math.abs(Math.sin(r));
    const ey = hw * Math.abs(Math.sin(r)) + hh * Math.abs(Math.cos(r));
    x0 = Math.min(x0, p.x - ex);
    x1 = Math.max(x1, p.x + ex);
    y0 = Math.min(y0, p.y - ey);
    y1 = Math.max(y1, p.y + ey);
  });
  const f = Math.min(1, area.w / (x1 - x0), area.h / (y1 - y0));
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  return t.map((p) => ({
    ...p,
    x: area.x + area.w / 2 + (p.x - cx) * f,
    y: area.y + area.h / 2 + (p.y - cy) * f,
    scale: p.scale * f,
  }));
}

/** Rows of stickers along concentric arcs; `cols` per arc, inner arcs follow below/above. */
function arc(items: Box[], area: Rect, cols: number, bend: number, tilt: boolean): Transform[] {
  const sweep = (Math.max(5, Math.min(Math.abs(bend), 300)) * Math.PI) / 180;
  const dir = bend < 0 ? -1 : 1; // 1 = ∩ rainbow, -1 = ∪ smile
  const rows = Math.ceil(items.length / cols);
  const width = area.w;
  // Radius so the outer arc spans the full width (or wraps for > 180°).
  const R0 = sweep >= Math.PI ? width / 2 : width / 2 / Math.sin(sweep / 2);
  const cellW = (R0 * sweep) / cols;
  const cellH = Math.min(cellW * 0.8, area.h / rows);
  const rowGap = cellH * 1.1;
  const out = items.map((b, i) => {
    const row = Math.floor(i / cols);
    const inRow = Math.min(cols, items.length - row * cols);
    const R = Math.max(cellH, R0 - row * rowGap);
    const a = -sweep / 2 + ((i % cols) + 0.5) * (sweep / inRow);
    const w = Math.min(cellW, (R * sweep) / inRow);
    return {
      x: R * Math.sin(a),
      y: -dir * R * Math.cos(a),
      scale: fit(b, w * 0.92, cellH * 0.92),
      rotation: tilt ? (dir * a * 180) / Math.PI : 0,
    };
  });
  return fitInto(items, out, area);
}

/** Half-extents of a rotated sticker's axis-aligned box. */
function extents(b: Box, scale: number, rotation: number) {
  const r = (rotation * Math.PI) / 180;
  const hw = (b.nw * scale) / 2;
  const hh = (b.nh * scale) / 2;
  const c = Math.abs(Math.cos(r));
  const n = Math.abs(Math.sin(r));
  return { ex: hw * c + hh * n, ey: hw * n + hh * c };
}

/**
 * Random, tilted placement with no overlaps: drop stickers one by one (largest first) at random
 * free spots; if one doesn't fit, shrink everything a bit and retry. Falls back to a grid.
 */
function scatter(items: Box[], area: Rect, rand: () => number): Transform[] {
  const n = items.length;
  const gap = area.w * 0.015;
  const rotations = items.map(() => rand() * 24 - 12);
  // Start from a cell size that leaves ~40% of the area free, then shrink until everything fits.
  let cell = Math.min(area.w * 0.42, Math.sqrt((area.w * area.h * 0.6) / n));
  const order = items.map((_, i) => i).sort((a, b) => items[b].nw * items[b].nh - items[a].nw * items[a].nh);

  for (let attempt = 0; attempt < 25; attempt++, cell *= 0.92) {
    const placed: { x: number; y: number; ex: number; ey: number }[] = [];
    const out: Transform[] = new Array(n);
    let ok = true;
    for (const i of order) {
      const scale = fit(items[i], cell, cell);
      const { ex, ey } = extents(items[i], scale, rotations[i]);
      if (ex * 2 > area.w || ey * 2 > area.h) {
        ok = false;
        break;
      }
      let spot: { x: number; y: number } | null = null;
      for (let tries = 0; tries < 400 && !spot; tries++) {
        const x = area.x + ex + rand() * (area.w - ex * 2);
        const y = area.y + ey + rand() * (area.h - ey * 2);
        const free = placed.every((p) => Math.abs(p.x - x) >= p.ex + ex + gap || Math.abs(p.y - y) >= p.ey + ey + gap);
        if (free) spot = { x, y };
      }
      if (!spot) {
        ok = false;
        break;
      }
      placed.push({ ...spot, ex, ey });
      out[i] = { ...spot, scale, rotation: rotations[i] };
    }
    if (ok) return out;
  }
  return grid(items, area, Math.ceil(Math.sqrt(n)), area.w * 0.4);
}

export function applyLayout(id: LayoutId, items: Box[], W: number, H: number, opts: LayoutOptions = {}): Transform[] {
  const rand = opts.rand ?? Math.random;
  const area = safeArea(W, H);
  const n = items.length;
  if (n === 0) return [];
  switch (id) {
    case "stack":
      return column(items, { ...area, y: area.y + area.h * 0.1, h: area.h * 0.8 }, W * 0.6, "center", "center");
    case "corner":
      return column(items, { ...area, y: area.y + area.h * 0.45, h: area.h * 0.55 }, W * 0.45, "left", "bottom");
    case "grid":
      return grid(items, area, Math.min(opts.cols ?? defaultCols(n), n), W * 0.4);
    case "arc": {
      if (Math.abs(opts.bend ?? DEFAULT_BEND) < 5) return grid(items, area, Math.min(opts.cols ?? n, n), W * 0.4);
      const cols = Math.min(opts.cols ?? Math.min(n, 5), n);
      return arc(items, { ...area, y: area.y + area.h * 0.1, h: area.h * 0.8 }, cols, opts.bend ?? DEFAULT_BEND, opts.tilt ?? true);
    }
    case "row": {
      const cols = Math.min(n, 4);
      const rows = Math.ceil(n / cols);
      const rowH = H * 0.1;
      return grid(items, { ...area, y: area.y + area.h - rows * rowH * 1.1, h: rows * rowH * 1.1 }, cols, rowH, "bottom");
    }
    case "circle": {
      if (n === 1) return grid(items, area, 1, W * 0.5);
      const cx = W / 2;
      const cy = area.y + area.h / 2;
      const r = Math.min(area.w, area.h) * 0.34;
      const cell = Math.min(((2 * Math.PI * r) / n) * 0.8, W * 0.3);
      return items.map((b, i) => {
        const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
        return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, scale: fit(b, cell, cell), rotation: 0 };
      });
    }
    case "hero": {
      const [first, ...rest] = items;
      const heroH = rest.length ? area.h * 0.5 : area.h;
      const hero = { x: W / 2, y: area.y + heroH / 2, scale: fit(first, area.w * 0.85, heroH * 0.9), rotation: 0 };
      if (!rest.length) return [hero];
      const below = { ...area, y: area.y + heroH, h: area.h - heroH };
      return [hero, ...grid(rest, below, Math.min(3, rest.length), W * 0.3, "center")];
    }
    case "scatter":
      return scatter(items, area, rand);
  }
}

/** Freeform: cascade new stickers around the center so they don't fully overlap. */
export function cascade(items: Box[], W: number, H: number, start = 0): Transform[] {
  return items.map((b, i) => {
    const k = start + i;
    return {
      x: W / 2 + ((k % 5) - 2) * W * 0.06,
      y: H / 2 + (Math.floor(k / 5) % 4) * H * 0.05 + ((k % 5) - 2) * H * 0.025,
      scale: fit(b, W * 0.4, H * 0.25),
      rotation: 0,
    };
  });
}
