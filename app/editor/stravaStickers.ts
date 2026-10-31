import type { Activity } from "@/app/lib/activity";
import { loadImage } from "./types";

export type Units = "metric" | "imperial";
export type StickerKey = "route" | "distance" | "pace" | "time" | "elevation" | "heartrate" | "cadence" | "calories" | "date" | "title";

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
  out.push({ key: "date", label: "Date", value: shortDate(a.date) });
  out.push({ key: "title", label: "Title", value: a.name });
  return out;
}

export function formatDate(iso: string) {
  // start_date_local is local wall time tagged as Z; read it as UTC to avoid shifting.
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** "Sun, Jun 14" — wall-clock date, read as UTC (see formatDate). */
export function shortDate(iso: string | Date) {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
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
  const raceH = a.race ? 64 + gap * 0.6 : 0;
  const routeH = route ? Math.min(route.height, 900) : 0;
  const routeW = route ? (route.width * routeH) / route.height : 0;
  const statsH = rows * cellH;

  const c = document.createElement("canvas");
  c.width = W + pad * 2;
  c.height = Math.ceil(pad * 2 + raceH + titleH + routeH + (route && stats.length ? gap : 0) + statsH);
  const ctx = c.getContext("2d")!;
  let y = pad;

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  if (a.race) {
    racePill(ctx, c.width / 2, y, family);
    y += raceH;
  }
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

function racePill(
  ctx: CanvasRenderingContext2D,
  cx: number,
  top: number,
  family: string,
  align: "center" | "left" = "center",
  height = 64,
) {
  ctx.save();
  ctx.shadowColor = "transparent";
  ctx.font = `800 ${height * 0.62}px ${family}`;
  const label = "RACE";
  const w = ctx.measureText(label).width + height * 0.75;
  const x = align === "center" ? cx - w / 2 : cx;
  ctx.fillStyle = ROUTE_COLOR;
  ctx.beginPath();
  ctx.roundRect(x, top, w, height, height / 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + w / 2, top + height * 0.52);
  ctx.restore();
  return w;
}

function pillWidth(family: string, height: number) {
  const m = document.createElement("canvas").getContext("2d")!;
  m.font = `800 ${height * 0.62}px ${family}`;
  return m.measureText("RACE").width + height * 0.75;
}

export type Week = { index: number; start: Date; end: Date; runs: Activity[] };

const DAY = 86_400_000;

/** Split runs into consecutive 7-day weeks starting on `from` (YYYY-MM-DD), through `to`. */
export function buildWeeks(runs: Activity[], from: string, to: string): Week[] {
  // Activity dates are local wall time tagged as UTC, so compare everything in UTC.
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`) + DAY;
  const count = Math.max(1, Math.ceil((end - start) / (7 * DAY)));
  const weeks: Week[] = Array.from({ length: count }, (_, i) => ({
    index: i + 1,
    start: new Date(start + i * 7 * DAY),
    end: new Date(Math.min(start + (i + 1) * 7 * DAY, end) - DAY),
    runs: [],
  }));
  for (const r of runs) {
    const i = Math.floor((Date.parse(r.date) - start) / (7 * DAY));
    if (i >= 0 && i < count) weeks[i].runs.push(r);
  }
  // Drop empty weeks after the last run (e.g. a range ending a day after race week).
  while (weeks.length > 1 && !weeks[weeks.length - 1].runs.length) weeks.pop();
  return weeks;
}

const monthDay = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });

/**
 * One week of a training block: long-run route on the left, totals on the right. Race week gets a RACE pill;
 * `raceDetails` adds a short distance · time line (skip it when the race has its own finale sticker).
 */
export async function renderWeekSticker(w: Week, units: Units, raceDetails = true) {
  await document.fonts?.ready;
  const family = fontFamily();
  const len = units === "metric" ? 1000 : 1609.344;
  const unit = units === "metric" ? "km" : "mi";
  const total = w.runs.reduce((s, r) => s + r.distance, 0);
  const race = w.runs.find((r) => r.race);
  const long = [...w.runs].sort((a, b) => b.distance - a.distance)[0];
  const featured = race ?? long;
  const route = featured?.polyline ? routeCanvas(featured.polyline, 300) : null;

  const sameMonth = w.start.getUTCMonth() === w.end.getUTCMonth();
  const range = sameMonth
    ? `${monthDay(w.start)}–${w.end.getUTCDate()}`
    : `${monthDay(w.start)} – ${monthDay(w.end)}`;
  const lines: { text: string; size: number; weight: number; alpha: number; color?: string }[] = [
    { text: `WEEK ${w.index} · ${range.toUpperCase()}`, size: 38, weight: 600, alpha: 0.85 },
    { text: w.runs.length ? `${(total / len).toFixed(1)} ${unit}` : "Rest", size: 110, weight: 800, alpha: 1 },
    {
      text: w.runs.length
        ? `${w.runs.length} run${w.runs.length > 1 ? "s" : ""} · long ${(long.distance / len).toFixed(1)} ${unit}`
        : "Recovery week",
      size: 40,
      weight: 500,
      alpha: 0.85,
    },
  ];
  if (race && raceDetails) {
    // No race name here: long names make this stop much wider than the others.
    lines.push({
      text: `Race · ${(race.distance / len).toFixed(2)} ${unit} · ${duration(race.movingTime)}`,
      size: 40,
      weight: 700,
      alpha: 1,
      color: ROUTE_COLOR,
    });
  }

  const m = document.createElement("canvas").getContext("2d")!;
  const widths = lines.map((l) => {
    m.font = `${l.weight} ${l.size}px ${family}`;
    return m.measureText(l.text).width;
  });
  const pad = 30;
  const gap = 36;
  // RACE pill sits inline after the week label, so race week stays the same height as other weeks.
  const pillH = 44;
  const pillGap = 16;
  if (race) widths[0] += pillGap + pillWidth(family, pillH);
  const textH = lines.reduce((s, l) => s + l.size * 1.15, 0);
  const routeBox = route ? Math.min(300, textH) : 0;
  const routeW = route ? (route.width / Math.max(route.width, route.height)) * routeBox : 0;
  const c = document.createElement("canvas");
  c.width = Math.ceil(pad * 2 + (route ? routeBox + gap : 0) + Math.max(...widths, 300));
  c.height = Math.ceil(pad * 2 + Math.max(textH, routeBox));
  const ctx = c.getContext("2d")!;

  if (route) {
    const rh = (route.height / Math.max(route.width, route.height)) * routeBox;
    ctx.drawImage(route, pad + (routeBox - routeW) / 2, (c.height - rh) / 2, routeW, rh);
  }
  const left = pad + (route ? routeBox + gap : 0);
  let y = (c.height - textH) / 2;
  if (race) {
    m.font = `${lines[0].weight} ${lines[0].size}px ${family}`;
    racePill(ctx, left + m.measureText(lines[0].text).width + pillGap, y + (lines[0].size - pillH) / 2, family, "left", pillH);
  }
  shadow(ctx);
  ctx.textBaseline = "top";
  for (const l of lines) {
    ctx.font = `${l.weight} ${l.size}px ${family}`;
    ctx.globalAlpha = l.alpha;
    ctx.fillStyle = l.color ?? "#fff";
    ctx.fillText(l.text, left, y);
    y += l.size * 1.15;
  }
  return toLayer(c);
}
