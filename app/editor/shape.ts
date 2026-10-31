import type { Transform } from "./types";

type Box = { nw: number; nh: number };
type Rect = { x: number; y: number; w: number; h: number };

/** Binary silhouette extracted from an image, at low resolution (longest side ≤ MASK_SIZE). */
export type ShapeMask = {
  w: number;
  h: number;
  /** 1 = inside the shape */
  data: Uint8Array;
  /** Bounding box of the inside pixels. */
  bbox: { x0: number; y0: number; x1: number; y1: number };
  area: number;
};

export type ShapeMode = "fill" | "outline";

const MASK_SIZE = 480;

/**
 * Find the shape in an image. Transparent images use alpha; otherwise the background color is
 * estimated from the border and pixels far from it (Otsu threshold) count as the shape.
 */
export function extractMask(img: HTMLImageElement, invert = false): ShapeMask | null {
  const f = MASK_SIZE / Math.max(img.naturalWidth, img.naturalHeight);
  const w = Math.max(1, Math.round(img.naturalWidth * f));
  const h = Math.max(1, Math.round(img.naturalHeight * f));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;
  const n = w * h;

  let transparent = 0;
  for (let i = 0; i < n; i++) if (px[i * 4 + 3] < 200) transparent++;

  const data = new Uint8Array(n);
  if (transparent > n * 0.05) {
    for (let i = 0; i < n; i++) data[i] = px[i * 4 + 3] > 127 ? 1 : 0;
  } else {
    // Background = average border color.
    let r = 0, g = 0, b = 0, cnt = 0;
    const add = (x: number, y: number) => {
      const i = (y * w + x) * 4;
      r += px[i];
      g += px[i + 1];
      b += px[i + 2];
      cnt++;
    };
    for (let x = 0; x < w; x++) {
      add(x, 0);
      add(x, h - 1);
    }
    for (let y = 1; y < h - 1; y++) {
      add(0, y);
      add(w - 1, y);
    }
    r /= cnt;
    g /= cnt;
    b /= cnt;
    const dist = new Float32Array(n);
    const hist = new Uint32Array(256);
    for (let i = 0; i < n; i++) {
      const d = Math.min(255, Math.hypot(px[i * 4] - r, px[i * 4 + 1] - g, px[i * 4 + 2] - b) / Math.sqrt(3));
      dist[i] = d;
      hist[d | 0]++;
    }
    const t = Math.max(12, otsu(hist, n));
    for (let i = 0; i < n; i++) data[i] = dist[i] > t ? 1 : 0;
  }
  if (invert) for (let i = 0; i < n; i++) data[i] ^= 1;

  let area = 0, x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (data[y * w + x]) {
        area++;
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
  // Nothing found, or the "shape" is basically the whole image.
  if (area < n * 0.005 || area > n * 0.97) return null;
  return { w, h, data, bbox: { x0, y0, x1, y1 }, area };
}

function otsu(hist: Uint32Array, total: number) {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, threshold = 0;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

/** Where the mask's bounding box lands inside `area` (aspect preserved, centered). */
export function maskPlacement(mask: ShapeMask, area: Rect) {
  const bw = mask.bbox.x1 - mask.bbox.x0 + 1;
  const bh = mask.bbox.y1 - mask.bbox.y0 + 1;
  const s = Math.min(area.w / bw, area.h / bh);
  return {
    s, // design units per mask pixel
    ox: area.x + (area.w - bw * s) / 2 - mask.bbox.x0 * s,
    oy: area.y + (area.h - bh * s) / 2 - mask.bbox.y0 * s,
  };
}

/** Chessboard distance from each inside pixel to the nearest outside pixel (two-pass chamfer). */
function distanceToEdge(mask: ShapeMask) {
  const { w, h, data } = mask;
  const d = new Float32Array(w * h);
  const INF = 1e9;
  for (let i = 0; i < w * h; i++) d[i] = data[i] ? INF : 0;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : d[y * w + x]);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (d[i]) d[i] = Math.min(d[i], at(x - 1, y) + 1, at(x, y - 1) + 1, at(x - 1, y - 1) + 1, at(x + 1, y - 1) + 1);
    }
  for (let y = h - 1; y >= 0; y--)
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (d[i]) d[i] = Math.min(d[i], at(x + 1, y) + 1, at(x, y + 1) + 1, at(x + 1, y + 1) + 1, at(x - 1, y + 1) + 1);
    }
  return d;
}

/**
 * Farthest-point sampling with chessboard distance: picks `n` candidates as spread out as possible.
 * Returns the picks and the smallest gap between any two (so square cells of that size never overlap).
 */
function spread(cands: number[], w: number, n: number, start: number) {
  const cx = cands.map((i) => i % w);
  const cy = cands.map((i) => Math.floor(i / w));
  const dist = new Float32Array(cands.length).fill(Infinity);
  const picked: number[] = [];
  let cur = start;
  let minGap = Infinity;
  for (let k = 0; k < n && cur >= 0; k++) {
    picked.push(cur);
    if (k > 0) minGap = Math.min(minGap, dist[cur]);
    let next = -1;
    let best = 0;
    for (let j = 0; j < cands.length; j++) {
      const d = Math.max(Math.abs(cx[j] - cx[cur]), Math.abs(cy[j] - cy[cur]));
      if (d < dist[j]) dist[j] = d;
      if (dist[j] > best) {
        best = dist[j];
        next = j;
      }
    }
    cur = next;
  }
  return { picked: picked.map((j) => ({ x: cx[j], y: cy[j], i: cands[j] })), minGap };
}

const fitBox = (b: Box, maxW: number, maxH: number) => Math.min(maxW / b.nw, maxH / b.nh, 4);

/** Place stickers inside (fill) or along the edge of (outline) the mask, without overlaps. */
export function placeInShape(items: Box[], area: Rect, mask: ShapeMask, mode: ShapeMode): Transform[] {
  const n = items.length;
  const { w, data } = mask;
  const { s, ox, oy } = maskPlacement(mask, area);
  const dt = distanceToEdge(mask);
  let cands: number[] = [];
  let start = 0;

  if (mode === "outline") {
    for (let i = 0; i < data.length; i++) if (data[i] && dt[i] <= 1) cands.push(i);
    start = 0; // first edge pixel in scan order = top of the shape
  } else {
    // Keep centers a little inside the edge, but loose enough that thin parts (fingers, letters) still count.
    const ideal = Math.sqrt(mask.area / n);
    for (const margin of [0.25, 0.12, 0]) {
      cands = [];
      for (let i = 0; i < data.length; i++) if (data[i] && dt[i] >= ideal * margin) cands.push(i);
      if (cands.length >= n) break;
    }
    // Start from the most interior point.
    start = cands.reduce((best, c, j) => (dt[c] > dt[cands[best]] ? j : best), 0);
  }
  if (!cands.length) return [];

  const { picked, minGap } = spread(cands, w, n, start);
  const gap = n === 1 ? Math.min(mask.bbox.x1 - mask.bbox.x0, mask.bbox.y1 - mask.bbox.y0) * 0.6 : minGap;
  // Square cells of the smallest gap never overlap (chessboard spacing).
  const cell = Math.max(1, gap * 0.92) * s;

  return items.map((b, k) => {
    const p = picked[k % picked.length];
    return { x: ox + (p.x + 0.5) * s, y: oy + (p.y + 0.5) * s, scale: fitBox(b, cell, cell), rotation: 0 };
  });
}

/** The mask drawn as a soft white silhouette (canvas sized in design units × `S`). */
export function silhouetteCanvas(mask: ShapeMask, area: Rect, S = 2) {
  const { s, ox, oy } = maskPlacement(mask, area);
  const { x0, y0, x1, y1 } = mask.bbox;
  const small = document.createElement("canvas");
  small.width = mask.w;
  small.height = mask.h;
  const sctx = small.getContext("2d")!;
  const img = sctx.createImageData(mask.w, mask.h);
  for (let i = 0; i < mask.data.length; i++) {
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = 255;
    img.data[i * 4 + 3] = mask.data[i] ? 255 : 0;
  }
  sctx.putImageData(img, 0, 0);

  const bw = (x1 - x0 + 1) * s;
  const bh = (y1 - y0 + 1) * s;
  const c = document.createElement("canvas");
  c.width = Math.ceil(bw * S);
  c.height = Math.ceil(bh * S);
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.globalAlpha = 0.22;
  ctx.drawImage(small, x0, y0, x1 - x0 + 1, y1 - y0 + 1, 0, 0, c.width, c.height);
  return { canvas: c, x: ox + x0 * s + bw / 2, y: oy + y0 * s + bh / 2, scale: 1 / S };
}
