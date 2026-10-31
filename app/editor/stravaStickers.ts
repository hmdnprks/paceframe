import type { Activity } from "@/app/lib/activity";
import { loadImage } from "./types";

export type Units = "metric" | "imperial";
export type StickerKey = "route" | "distance" | "pace" | "time" | "elevation" | "heartrate" | "cadence" | "calories" | "title";

// Matches Strava's own route sticker.
const ROUTE_COLOR = "#FC5200";

const isRun = (a: Activity) => /Run|Walk|Hike/.test(a.sport);

function duration(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.round(s % 60);
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return `${h ? `${h}:` : ""}${mm}:${String(sec).padStart(2, "0")}`;
}

/** Stat stickers available for this activity, with label + formatted value. */
export function statsFor(a: Activity, units: Units): { key: StickerKey; label: string; value: string }[] {
  const metric = units === "metric";
  const distUnit = metric ? 1000 : 1609.344;
  const out: { key: StickerKey; label: string; value: string }[] = [];
  if (a.polyline) out.push({ key: "route", label: "Route", value: "Map line" });
  if (a.distance) out.push({ key: "distance", label: "Distance", value: `${(a.distance / distUnit).toFixed(2)} ${metric ? "km" : "mi"}` });
  if (a.avgSpeed) {
    out.push(
      isRun(a)
        ? { key: "pace", label: "Pace", value: `${duration(distUnit / a.avgSpeed)} /${metric ? "km" : "mi"}` }
        : { key: "pace", label: "Speed", value: `${((a.avgSpeed * 3600) / distUnit).toFixed(1)} ${metric ? "km/h" : "mph"}` },
    );
  }
  if (a.movingTime) out.push({ key: "time", label: "Time", value: duration(a.movingTime) });
  if (a.elevation) out.push({ key: "elevation", label: "Elev Gain", value: metric ? `${Math.round(a.elevation)} m` : `${Math.round(a.elevation * 3.28084)} ft` });
  if (a.avgHr) out.push({ key: "heartrate", label: "Avg HR", value: `${Math.round(a.avgHr)} bpm` });
  if (a.cadence) out.push({ key: "cadence", label: "Cadence", value: `${a.cadence} ${isRun(a) ? "spm" : "rpm"}` });
  if (a.calories) out.push({ key: "calories", label: "Calories", value: `${Math.round(a.calories)} Cal` });
  out.push({ key: "title", label: "Title", value: a.name });
  return out;
}

export function formatDate(iso: string) {
  // start_date_local is local wall time tagged as Z; read it as UTC to avoid shifting.
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** Google encoded polyline → [lat, lng][] */
export function decodePolyline(str: string): [number, number][] {
  const pts: [number, number][] = [];
  let i = 0, lat = 0, lng = 0;
  while (i < str.length) {
    for (const which of [0, 1]) {
      let shift = 0, result = 0, b: number;
      do {
        b = str.charCodeAt(i++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const d = result & 1 ? ~(result >> 1) : result >> 1;
      if (which === 0) lat += d;
      else lng += d;
    }
    pts.push([lat / 1e5, lng / 1e5]);
  }
  return pts;
}

function fontFamily() {
  return getComputedStyle(document.body).fontFamily || "system-ui, sans-serif";
}

function shadow(ctx: CanvasRenderingContext2D) {
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 3;
}

async function toLayer(canvas: HTMLCanvasElement) {
  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("render failed"))), "image/png"));
  return loadImage(blob);
}

/** Strava-style route: thick orange line, no markers, transparent background. Longest side = `size`. */
function routeCanvas(polyline: string, size = 1000) {
  const pts = decodePolyline(polyline);
  const lat0 = (pts.reduce((s, p) => s + p[0], 0) / pts.length) * (Math.PI / 180);
  const xy = pts.map(([la, ln]) => [ln * Math.cos(lat0), -la]);
  const xs = xy.map((p) => p[0]);
  const ys = xy.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const stroke = size * 0.03;
  const pad = stroke;
  const span = Math.max(x1 - x0, y1 - y0) || 1;
  const f = (size - pad * 2) / span;
  const c = document.createElement("canvas");
  c.width = Math.ceil(Math.max((x1 - x0) * f + pad * 2, stroke * 4));
  c.height = Math.ceil(Math.max((y1 - y0) * f + pad * 2, stroke * 4));
  const ox = (c.width - (x1 - x0) * f) / 2;
  const oy = (c.height - (y1 - y0) * f) / 2;
  const ctx = c.getContext("2d")!;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = ROUTE_COLOR;
  ctx.lineWidth = stroke;
  ctx.beginPath();
  xy.forEach((p, i) => {
    const x = ox + (p[0] - x0) * f;
    const y = oy + (p[1] - y0) * f;
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  });
  ctx.stroke();
  return c;
}

function textCanvas(lines: { text: string; size: number; weight: number; alpha: number }[]) {
  const family = fontFamily();
  const pad = 30;
  const gap = 6;
  const measure = document.createElement("canvas").getContext("2d")!;
  const widths = lines.map((l) => {
    measure.font = `${l.weight} ${l.size}px ${family}`;
    return measure.measureText(l.text).width;
  });
  const c = document.createElement("canvas");
  c.width = Math.ceil(Math.max(...widths) + pad * 2);
  c.height = Math.ceil(lines.reduce((s, l) => s + l.size * 1.1, 0) + gap * (lines.length - 1) + pad * 2);
  const ctx = c.getContext("2d")!;
  shadow(ctx);
  ctx.textBaseline = "top";
  ctx.fillStyle = "#fff";
  let y = pad;
  for (const l of lines) {
    ctx.font = `${l.weight} ${l.size}px ${family}`;
    ctx.globalAlpha = l.alpha;
    ctx.fillText(l.text, pad, y);
    y += l.size * 1.1 + gap;
  }
  return c;
}

/** Render one sticker as a transparent PNG layer (sized for crisp export at full quality). */
export async function renderStravaSticker(key: StickerKey, a: Activity, units: Units) {
  await document.fonts?.ready;
  if (key === "route") return toLayer(routeCanvas(a.polyline!));
  if (key === "title") {
    return toLayer(
      textCanvas([
        { text: a.name, size: 84, weight: 800, alpha: 1 },
        { text: formatDate(a.date), size: 44, weight: 500, alpha: 0.85 },
      ]),
    );
  }
  const stat = statsFor(a, units).find((s) => s.key === key)!;
  return toLayer(
    textCanvas([
      { text: stat.label.toUpperCase(), size: 40, weight: 600, alpha: 0.85 },
      { text: stat.value, size: 120, weight: 800, alpha: 1 },
    ]),
  );
}

/**
 * One sticker per run: route on top, chosen metrics in a centered grid below
 * (label over value, like Strava's share overlay), optional title + date on top.
 */
export async function renderRunSticker(a: Activity, keys: Set<StickerKey>, units: Units) {
  await document.fonts?.ready;
  const family = fontFamily();
  const W = 1000;
  const stats = statsFor(a, units).filter((s) => keys.has(s.key) && s.key !== "route" && s.key !== "title");
  const route = keys.has("route") && a.polyline ? routeCanvas(a.polyline, 900) : null;
  const title = keys.has("title");

  const cols = stats.length <= 3 ? Math.max(1, stats.length) : stats.length === 4 ? 2 : 3;
  const rows = Math.ceil(stats.length / cols);
  const cellW = W / cols;
  const labelSize = 38;
  // Shrink values together so the widest one fits its cell.
  const m = document.createElement("canvas").getContext("2d")!;
  let valueSize = cols === 1 ? 130 : 96;
  m.font = `800 ${valueSize}px ${family}`;
  const widest = Math.max(0, ...stats.map((s) => m.measureText(s.value).width));
  if (widest > cellW * 0.92) valueSize = Math.floor((valueSize * cellW * 0.92) / widest);
  const cellH = labelSize * 1.2 + valueSize * 1.1 + 24;

  const pad = 30;
  const gap = 40;
  const titleH = title ? 84 * 1.15 + 44 * 1.2 + gap : 0;
  const routeH = route ? Math.min(route.height, 900) : 0;
  const routeW = route ? (route.width * routeH) / route.height : 0;
  const statsH = rows * cellH;

  const c = document.createElement("canvas");
  c.width = W + pad * 2;
  c.height = Math.ceil(pad * 2 + titleH + routeH + (route && stats.length ? gap : 0) + statsH);
  const ctx = c.getContext("2d")!;
  let y = pad;

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  if (title) {
    shadow(ctx);
    ctx.fillStyle = "#fff";
    ctx.font = `800 84px ${family}`;
    ctx.fillText(a.name, c.width / 2, y, W);
    ctx.globalAlpha = 0.85;
    ctx.font = `500 44px ${family}`;
    ctx.fillText(formatDate(a.date), c.width / 2, y + 84 * 1.15, W);
    ctx.globalAlpha = 1;
    y += titleH;
  }

  if (route) {
    ctx.shadowColor = "transparent";
    ctx.drawImage(route, (c.width - routeW) / 2, y, routeW, routeH);
    y += routeH + (stats.length ? gap : 0);
  }

  shadow(ctx);
  ctx.fillStyle = "#fff";
  stats.forEach((s, i) => {
    const row = Math.floor(i / cols);
    const inRow = Math.min(cols, stats.length - row * cols);
    const rowLeft = pad + (W - inRow * cellW) / 2;
    const cx = rowLeft + ((i % cols) + 0.5) * cellW;
    const top = y + row * cellH;
    ctx.globalAlpha = 0.85;
    ctx.font = `600 ${labelSize}px ${family}`;
    ctx.fillText(s.label.toUpperCase(), cx, top, cellW * 0.95);
    ctx.globalAlpha = 1;
    ctx.font = `800 ${valueSize}px ${family}`;
    ctx.fillText(s.value, cx, top + labelSize * 1.2, cellW * 0.95);
  });

  return toLayer(c);
}
