import type { Activity } from "@/app/lib/activity";
import { loadImage } from "./types";

export type Units = "metric" | "imperial";
export type StickerKey = "route" | "distance" | "pace" | "time" | "elevation" | "heartrate" | "cadence" | "calories" | "title";

const ORANGE = "#fc4c02";

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

function routeCanvas(polyline: string) {
  const pts = decodePolyline(polyline);
  const lat0 = (pts.reduce((s, p) => s + p[0], 0) / pts.length) * (Math.PI / 180);
  const xy = pts.map(([la, ln]) => [ln * Math.cos(lat0), -la]);
  const xs = xy.map((p) => p[0]);
  const ys = xy.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const size = 1000;
  const pad = 40;
  const span = Math.max(x1 - x0, y1 - y0) || 1;
  const f = (size - pad * 2) / span;
  const w = Math.max(200, (x1 - x0) * f + pad * 2);
  const h = Math.max(200, (y1 - y0) * f + pad * 2);
  const c = document.createElement("canvas");
  c.width = Math.ceil(w);
  c.height = Math.ceil(h);
  const ctx = c.getContext("2d")!;
  const ox = (w - (x1 - x0) * f) / 2;
  const oy = (h - (y1 - y0) * f) / 2;
  const P = (p: number[]) => [ox + (p[0] - x0) * f, oy + (p[1] - y0) * f] as const;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  shadow(ctx);
  ctx.strokeStyle = ORANGE;
  ctx.lineWidth = 16;
  ctx.beginPath();
  xy.forEach((p, i) => (i ? ctx.lineTo(...P(p)) : ctx.moveTo(...P(p))));
  ctx.stroke();
  // start/finish markers
  for (const [p, fill] of [[xy[0], "#fff"], [xy[xy.length - 1], ORANGE]] as const) {
    const [x, y] = P(p);
    ctx.beginPath();
    ctx.arc(x, y, 14, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = fill === "#fff" ? ORANGE : "#fff";
    ctx.stroke();
  }
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
