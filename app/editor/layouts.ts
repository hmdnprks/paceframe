import { placeInShape, type ShapeMask, type ShapeMode } from "./shape";
import type { Split, Transform } from "./types";

type Box = { nw: number; nh: number };
type Rect = { x: number; y: number; w: number; h: number };

export type LayoutId = "stack" | "corner" | "grid" | "arc" | "timeline" | "row" | "circle" | "hero" | "scatter" | "shape" | "versus" | "honeycomb" | "spiral";

export const LAYOUTS: { id: LayoutId; label: string; hint: string }[] = [
  { id: "stack", label: "Stack", hint: "Centered column" },
  { id: "corner", label: "Corner", hint: "Bottom-left, Strava style" },
  { id: "grid", label: "Grid", hint: "Pick columns" },
  { id: "arc", label: "Arc", hint: "Curved rows, adjustable" },
  { id: "timeline", label: "Timeline", hint: "In order along a line" },
  { id: "row", label: "Bottom bar", hint: "Row along the bottom" },
  { id: "circle", label: "Circle", hint: "Ring around center" },
  { id: "hero", label: "Hero", hint: "First big, rest below" },
  { id: "scatter", label: "Scatter", hint: "Random, tilted" },
  { id: "honeycomb", label: "Honeycomb", hint: "Offset rows, tightly packed" },
  { id: "spiral", label: "Spiral", hint: "First in the center, growing out" },
];

const fit = (b: Box, maxW: number, maxH: number) => Math.min(maxW / b.nw, maxH / b.nh, 4);

/** Area kept clear of Instagram's top bar and reply box. */
export function safeArea(W: number, H: number): Rect {
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
  /** Timeline: alternate sides of the line. */
  zigzag?: boolean;
  /** Timeline: run left→right instead of top→bottom. */
  horizontal?: boolean;
  /** Timeline: the last sticker is a big finale (e.g. the race). */
  hero?: boolean;
  /** Per-sticker weights (e.g. run distance) for layouts that size by value. */
  weights?: number[];
  /** Spiral: size stickers by weight instead of growing outward. */
  bySize?: boolean;
  /** Spiral: draw a faint path through the stickers. */
  path?: boolean;
  /** Versus: how the background is split (stickers go one per half, badge in between). */
  split?: Split;
  /** Shape: silhouette from an uploaded image. */
  mask?: ShapeMask | null;
  shapeMode?: ShapeMode;
  /** Shape: draw the silhouette faintly behind the stickers. */
  silhouette?: boolean;
  rand?: () => number;
};

/** Layouts that open the tuning panel (columns, bend…) after being applied. */
export const TUNABLE: LayoutId[] = ["grid", "arc", "timeline", "shape", "honeycomb", "spiral"];
export const DEFAULT_BEND = 100;

export const MAX_COLS = 8;
export const defaultCols = (n: number) => (n > 6 ? 3 : Math.min(n, 2));

/** Uniformly shrink (never grow) a placement so its bounds fit the area, then center it there. */
function fitInto(items: Box[], t: Transform[], area: Rect, grow = false): Transform[] {
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
  const f = Math.min(grow ? Infinity : 1, area.w / (x1 - x0), area.h / (y1 - y0));
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

type TimelineOpts = { zigzag: boolean; horizontal: boolean; hero: boolean };

/**
 * The timeline's line and node points (design units), shared by the layout and its line decoration.
 * With `hero`, the last item gets a big finale cell at the end of the line and `end` is its node.
 */
export function timelineGuide(n: number, W: number, H: number, o: TimelineOpts) {
  const area = safeArea(W, H);
  const hero = o.hero && n >= 2;
  const m = hero ? n - 1 : n;
  const heroSize = hero ? (o.horizontal ? area.w : area.h) * 0.32 : 0;
  const regular = o.horizontal ? { ...area, w: area.w - heroSize } : { ...area, h: area.h - heroSize };
  const step = (o.horizontal ? regular.w : regular.h) / Math.max(1, m);
  const spineX = o.zigzag ? area.x + area.w / 2 : area.x + area.w * 0.06;
  const spineY = o.zigzag ? area.y + area.h / 2 : area.y + area.h * 0.75;
  const nodes = Array.from({ length: m }, (_, i) =>
    o.horizontal ? { x: area.x + step * (i + 0.5), y: spineY } : { x: spineX, y: area.y + step * (i + 0.5) },
  );
  const gap = W * 0.035;
  let end: { x: number; y: number } | null = null;
  let heroCell: { x: number; y: number; w: number; h: number } | null = null;
  if (hero) {
    if (o.horizontal) {
      end = { x: area.x + regular.w + gap * 0.5, y: spineY };
      heroCell = { x: end.x + gap * 0.5, y: area.y, w: heroSize - gap, h: area.h };
    } else if (o.zigzag) {
      // Centered under the line's end.
      end = { x: spineX, y: area.y + regular.h + gap * 0.5 };
      heroCell = { x: area.x, y: end.y + gap, w: area.w, h: heroSize - gap * 1.5 };
    } else {
      // Beside the line like the other stops, just bigger.
      end = { x: spineX, y: area.y + regular.h + heroSize / 2 };
      heroCell = { x: spineX + gap, y: area.y + regular.h + gap * 0.5, w: area.x + area.w - spineX - gap, h: heroSize - gap };
    }
  }
  return { area: regular, step, nodes, end, heroCell };
}

/** Stickers in order beside a line; zigzag alternates sides so each can be twice as big. */
function timeline(items: Box[], W: number, H: number, o: TimelineOpts): Transform[] {
  const { area, step, nodes, heroCell } = timelineGuide(items.length, W, H, o);
  const gap = W * 0.035;
  return items.map((b, i) => {
    if (heroCell && i === items.length - 1) {
      const scale = fit(b, heroCell.w, heroCell.h);
      const w = b.nw * scale;
      // Non-zigzag vertical keeps the left edge against the line; otherwise center it in the cell.
      const x = !o.horizontal && !o.zigzag ? heroCell.x + w / 2 : heroCell.x + heroCell.w / 2;
      return { x, y: heroCell.y + heroCell.h / 2, scale, rotation: 0 };
    }
    const node = nodes[i];
    const side = o.zigzag ? (i % 2 ? 1 : -1) : 1;
    if (o.horizontal) {
      const cellW = step * (o.zigzag ? 1.9 : 0.94);
      const cellH = o.zigzag ? area.h / 2 - gap : area.h * 0.75 - gap;
      const scale = fit(b, cellW, cellH);
      const h = b.nh * scale;
      // Above the line (or below for every other one when zigzagging).
      const y = side < 0 || !o.zigzag ? node.y - gap - h / 2 : node.y + gap + h / 2;
      return { x: node.x, y, scale, rotation: 0 };
    }
    const cellH = step * (o.zigzag ? 1.9 : 0.94);
    const cellW = o.zigzag ? area.w / 2 - gap : area.x + area.w - node.x - gap;
    const scale = fit(b, cellW, cellH);
    const w = b.nw * scale;
    const x = side > 0 ? node.x + gap + w / 2 : node.x - gap - w / 2;
    return { x, y: node.y, scale, rotation: 0 };
  });
}

/**
 * Then vs Now: items[0] in the first half, items[1] in the second, items[2] (the difference badge)
 * between them. Side by side keeps stickers low so faces stay visible; stacked hugs the divider.
 */
function versus(items: Box[], W: number, H: number, split: Split): Transform[] {
  const area = safeArea(W, H);
  const gap = W * 0.03;
  const [a, b, badge] = items;
  const out: Transform[] = [];
  if (split === "stacked") {
    const badgeScale = badge ? fit(badge, W * 0.55, H * 0.07) : 0;
    const badgeH = badge ? badge.nh * badgeScale : 0;
    const topRoom = H / 2 - badgeH / 2 - gap - area.y;
    const bottomRoom = area.y + area.h - (H / 2 + badgeH / 2 + gap);
    const sa = fit(a, area.w * 0.62, topRoom);
    const sb = fit(b, area.w * 0.62, bottomRoom);
    out.push({ x: W / 2, y: H / 2 - badgeH / 2 - gap - (a.nh * sa) / 2, scale: sa, rotation: 0 });
    out.push({ x: W / 2, y: H / 2 + badgeH / 2 + gap + (b.nh * sb) / 2, scale: sb, rotation: 0 });
    if (badge) out.push({ x: W / 2, y: H / 2, scale: badgeScale, rotation: 0 });
  } else {
    const cellW = W / 2 - gap * 2;
    const cellH = area.h * 0.4;
    const sa = fit(a, cellW, cellH);
    const sb = fit(b, cellW, cellH);
    const bottom = area.y + area.h;
    out.push({ x: W / 4, y: bottom - (a.nh * sa) / 2, scale: sa, rotation: 0 });
    out.push({ x: (W * 3) / 4, y: bottom - (b.nh * sb) / 2, scale: sb, rotation: 0 });
    if (badge) {
      const s = fit(badge, W * 0.6, H * 0.08);
      const top = bottom - Math.max(a.nh * sa, b.nh * sb);
      out.push({ x: W / 2, y: top - gap - (badge.nh * s) / 2, scale: s, rotation: 0 });
    }
  }
  // Anything beyond the three goes into a simple grid below the middle.
  return items.length > 3 ? [...out, ...grid(items.slice(3), area, defaultCols(items.length - 3), W * 0.3)] : out;
}

/** Columns that make a honeycomb roughly fill the safe area. */
export function honeyCols(n: number, W = 1080, H = 1920) {
  const area = safeArea(W, H);
  return Math.max(1, Math.min(MAX_COLS, n, Math.round(Math.sqrt((n * area.w) / (area.h * 0.87)))));
}

/** Hex-style packing: every other row shifted half a cell, rows overlapping like a honeycomb. */
function honeycomb(items: Box[], area: Rect, cols: number): Transform[] {
  const rows = Math.ceil(items.length / cols);
  // Shrink cells until the block fits the area's height too.
  let cell = area.w / (cols + (rows > 1 ? 0.5 : 0));
  cell = Math.min(cell, area.h / (1 + (rows - 1) * 0.87));
  const rowH = cell * 0.87;
  const blockH = cell + (rows - 1) * rowH;
  const top = area.y + (area.h - blockH) / 2 + cell / 2;
  return items.map((b, i) => {
    const r = Math.floor(i / cols);
    const inRow = Math.min(cols, items.length - r * cols);
    const shift = r % 2 ? cell / 2 : 0;
    const rowW = inRow * cell + (rows > 1 ? cell / 2 : 0);
    const left = area.x + (area.w - rowW) / 2 + shift + cell / 2;
    return { x: left + (i % cols) * cell, y: top + r * rowH, scale: fit(b, cell * 0.84, cell * 0.84), rotation: 0 };
  });
}

/**
 * Archimedean spiral from the center outward, in sticker order. Sizes grow along the spiral,
 * or follow `weights` (e.g. distance) when `bySize`. The result is scaled to fill the area.
 */
function spiral(items: Box[], area: Rect, weights: number[] | undefined, bySize: boolean): Transform[] {
  const n = items.length;
  const wMax = Math.max(0, ...(weights ?? []));
  const sizes = items.map((_, i) => {
    const t = bySize && wMax > 0 ? Math.sqrt((weights?.[i] ?? 0) / wMax) : n > 1 ? i / (n - 1) : 1;
    return 0.45 + 0.55 * t; // relative cell size
  });
  const out: Transform[] = [];
  let theta = 0;
  let r = 0;
  for (let i = 0; i < n; i++) {
    const size = sizes[i];
    out.push({ x: r * Math.cos(theta), y: r * Math.sin(theta), scale: fit(items[i], size, size), rotation: 0 });
    const next = sizes[Math.min(i + 1, n - 1)];
    const step = (size + next) / 2 + 0.12;
    // Advance along the arc by about one sticker; the radius grows a full sticker per turn so rings don't touch.
    const dTheta = r < step ? Math.PI / 2 : step / r;
    theta += dTheta;
    r += ((Math.max(size, next) + 0.22) * dTheta) / (2 * Math.PI) + (i === 0 ? step : 0);
  }
  return fitInto(items, out, area, true);
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
    case "shape":
      if (!opts.mask) return grid(items, area, defaultCols(n), W * 0.4);
      return placeInShape(items, area, opts.mask, opts.shapeMode ?? "fill");
    case "honeycomb":
      return honeycomb(items, area, Math.min(opts.cols ?? honeyCols(n, W, H), n));
    case "spiral":
      return spiral(items, area, opts.weights, opts.bySize ?? false);
    case "versus":
      if (n < 2) return grid(items, area, 1, W * 0.5);
      return versus(items, W, H, opts.split ?? "side");
    case "timeline":
      return timeline(items, W, H, { zigzag: opts.zigzag ?? false, horizontal: opts.horizontal ?? false, hero: opts.hero ?? false });
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
