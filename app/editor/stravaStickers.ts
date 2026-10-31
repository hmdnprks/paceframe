import type { Activity } from "@/app/lib/activity";
import { loadImage } from "./types";

export type Units = "metric" | "imperial";
export type StickerKey = "route" | "distance" | "pace" | "time" | "elevation" | "heartrate" | "cadence" | "calories" | "date" | "title";

// Matches Strava's own route sticker.
const ROUTE_COLOR = "#FC5200";

const isRun = (a: Activity) => /Run|Walk|Hike/.test(a.sport);

export function duration(s: number) {
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
function routeCanvas(polyline: string, size = 1000, strokeRatio = 0.03) {
  const pts = decodePolyline(polyline);
  const lat0 = (pts.reduce((s, p) => s + p[0], 0) / pts.length) * (Math.PI / 180);
  const xy = pts.map(([la, ln]) => [ln * Math.cos(lat0), -la]);
  const xs = xy.map((p) => p[0]);
  const ys = xy.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const stroke = size * strokeRatio;
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
  const x = align === "center" ? cx - pillWidth(family, height) / 2 : cx;
  return pill(ctx, "RACE", x, top, height, family, ROUTE_COLOR, "#fff");
}

function pillWidth(family: string, height: number, label = "RACE") {
  const m = document.createElement("canvas").getContext("2d")!;
  m.font = `800 ${height * 0.55}px ${family}`;
  return m.measureText(label).width + height * 0.9;
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

/** Break text into at most `maxLines` lines that fit `maxW`, ellipsizing the last one. */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width <= maxW || !line) line = next;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    let last = lines.slice(maxLines - 1).join(" ");
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxW) last = last.slice(0, -1);
    lines.splice(maxLines - 1, lines.length, `${last.trimEnd()}…`);
  }
  return lines;
}

function pill(ctx: CanvasRenderingContext2D, label: string, x: number, top: number, h: number, family: string, bg: string, fg: string) {
  ctx.save();
  ctx.shadowColor = "transparent";
  ctx.font = `800 ${h * 0.55}px ${family}`;
  const w = ctx.measureText(label).width + h * 0.9;
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(x, top, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + w / 2, top + h * 0.53);
  ctx.restore();
  return w;
}

export type ResultTime = "elapsed" | "moving";

export const resultSeconds = (a: Activity, t: ResultTime) => (t === "elapsed" ? a.elapsedTime || a.movingTime : a.movingTime);

export type CardMetric = "distance" | "pace" | "heartrate" | "maxhr" | "elevation" | "cadence" | "calories" | "moving" | "elapsed";

export const CARD_METRICS: { key: CardMetric; label: string }[] = [
  { key: "distance", label: "Distance" },
  { key: "pace", label: "Avg pace" },
  { key: "heartrate", label: "Avg HR" },
  { key: "maxhr", label: "Max HR" },
  { key: "elevation", label: "Elev gain" },
  { key: "cadence", label: "Cadence" },
  { key: "calories", label: "Calories" },
  { key: "moving", label: "Moving time" },
  { key: "elapsed", label: "Elapsed time" },
];

export const MAX_CARD_METRICS = 6;

/** Formatted value of a card metric, or null when the activity has no data for it. */
export function cardMetricValue(a: Activity, key: CardMetric, time: ResultTime, units: Units): string | null {
  const len = units === "metric" ? 1000 : 1609.344;
  const unit = units === "metric" ? "km" : "mi";
  switch (key) {
    case "distance":
      return a.distance ? `${(a.distance / len).toFixed(2)} ${unit}` : null;
    case "pace":
      return a.distance ? `${duration(resultSeconds(a, time) / (a.distance / len))} /${unit}` : null;
    case "heartrate":
      return a.avgHr ? `${Math.round(a.avgHr)} bpm` : null;
    case "maxhr":
      return a.maxHr ? `${Math.round(a.maxHr)} bpm` : null;
    case "elevation":
      return a.elevation ? (units === "metric" ? `${Math.round(a.elevation)} m` : `${Math.round(a.elevation * 3.28084)} ft`) : null;
    case "cadence":
      return a.cadence ? `${a.cadence} spm` : null;
    case "calories":
      return a.calories ? `${Math.round(a.calories)} Cal` : null;
    case "moving":
      return a.movingTime ? duration(a.movingTime) : null;
    case "elapsed":
      return a.elapsedTime ? duration(a.elapsedTime) : null;
  }
}

export const defaultCardMetrics = (a: Activity): CardMetric[] =>
  a.avgHr ? ["distance", "pace", "heartrate"] : ["distance", "pace", "elevation"];

/** Everything needed to (re)render a finisher card, kept on the sticker so it can be edited later. */
export type FinisherSource = {
  kind: "finisher";
  run: Activity;
  time: ResultTime;
  pr: boolean;
  units: Units;
  metrics: CardMetric[];
};

/** Finisher card: badges, race name + date, big finish time, route, and a stats row. */
export async function renderFinisherCard(a: Activity, opts: Omit<FinisherSource, "kind" | "run">) {
  await document.fonts?.ready;
  const family = fontFamily();
  const W = 1000;
  const pad = 40;
  const secs = resultSeconds(a, opts.time);
  const stats = CARD_METRICS.filter((m) => opts.metrics.includes(m.key))
    .map((m) => ({ label: m.label, value: cardMetricValue(a, m.key, opts.time, opts.units) }))
    .filter((s): s is { label: string; value: string } => !!s.value)
    .slice(0, MAX_CARD_METRICS);
  // 1–3 in a row, 4 as 2×2, 5–6 as two rows of 3.
  const cols = stats.length <= 3 ? Math.max(1, stats.length) : stats.length === 4 ? 2 : 3;
  const rows = Math.ceil(stats.length / cols);

  const m = document.createElement("canvas").getContext("2d")!;
  m.font = `800 76px ${family}`;
  const nameLines = wrap(m, a.name, W, 2);
  const route = a.polyline ? routeCanvas(a.polyline, 560) : null;
  const routeH = route ? Math.min(route.height, 560) : 0;
  const routeW = route ? (route.width * routeH) / route.height : 0;

  const pillH = 64;
  const timeSize = 230;
  const statLabel = 38;
  const cellW = W / cols;
  // Shrink values together so the widest fits its cell.
  let statValue = cols === 1 ? 96 : 72;
  m.font = `800 ${statValue}px ${family}`;
  const widest = Math.max(0, ...stats.map((s) => m.measureText(s.value).width));
  if (widest > cellW * 0.9) statValue = Math.floor((statValue * cellW * 0.9) / widest);
  const rowH = statLabel * 1.2 + statValue * 1.1 + 24;
  const gap = 36;
  const height =
    pad * 2 + pillH + gap + nameLines.length * 76 * 1.12 + 44 * 1.3 + gap * 0.5 + timeSize * 1.0 + gap + (route ? routeH + gap : 0) + rows * rowH;

  const c = document.createElement("canvas");
  c.width = W + pad * 2;
  c.height = Math.ceil(height);
  const ctx = c.getContext("2d")!;
  const cx = c.width / 2;
  let y = pad;

  // Badges, centered as a row.
  const badges: [string, string, string][] = [["FINISHER", ROUTE_COLOR, "#fff"]];
  if (opts.pr) badges.push(["PR", "#fff", "#111"]);
  const widths = badges.map(([l]) => pillWidth(family, pillH, l));
  let x = cx - (widths.reduce((s, w) => s + w, 0) + 16 * (badges.length - 1)) / 2;
  badges.forEach(([l, bg, fg], i) => {
    pill(ctx, l, x, y, pillH, family, bg, fg);
    x += widths[i] + 16;
  });
  y += pillH + gap;

  shadow(ctx);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.font = `800 76px ${family}`;
  for (const line of nameLines) {
    ctx.fillText(line, cx, y);
    y += 76 * 1.12;
  }
  ctx.globalAlpha = 0.85;
  ctx.font = `500 44px ${family}`;
  ctx.fillText(formatDate(a.date), cx, y);
  ctx.globalAlpha = 1;
  y += 44 * 1.3 + gap * 0.5;

  ctx.font = `900 ${timeSize}px ${family}`;
  ctx.fillText(duration(secs), cx, y, W);
  y += timeSize + gap;

  if (route) {
    ctx.save();
    ctx.shadowColor = "transparent";
    ctx.drawImage(route, cx - routeW / 2, y, routeW, routeH);
    ctx.restore();
    y += routeH + gap;
  }

  stats.forEach((s, i) => {
    const row = Math.floor(i / cols);
    const inRow = Math.min(cols, stats.length - row * cols);
    const sx = pad + (W - inRow * cellW) / 2 + cellW * ((i % cols) + 0.5);
    const sy = y + row * rowH;
    ctx.globalAlpha = 0.85;
    ctx.font = `600 ${statLabel}px ${family}`;
    ctx.fillText(s.label.toUpperCase(), sx, sy, cellW * 0.95);
    ctx.globalAlpha = 1;
    ctx.font = `800 ${statValue}px ${family}`;
    ctx.fillText(s.value, sx, sy + statLabel * 1.2, cellW * 0.95);
  });

  return toLayer(c);
}

/** "GOAL 2:00:00 → FINISHED 1:57:42" with a margin badge (orange when beaten). */
export async function renderGoalSticker(goalSecs: number, actualSecs: number) {
  await document.fonts?.ready;
  const family = fontFamily();
  const pad = 36;
  const label = 38;
  const value = 110;
  const arrowGap = 70;
  const diff = Math.round(actualSecs - goalSecs);
  const beat = diff < 0;
  const badge = diff === 0 ? "Right on goal" : `${beat ? "−" : "+"}${duration(Math.abs(diff))} ${beat ? "under goal" : "over goal"}`;

  const m = document.createElement("canvas").getContext("2d")!;
  m.font = `800 ${value}px ${family}`;
  const goalW = m.measureText(duration(goalSecs)).width;
  const actualW = m.measureText(duration(actualSecs)).width;
  const badgeH = 72;
  const badgeW = pillWidth(family, badgeH, badge);

  const rowW = goalW + arrowGap * 2 + actualW;
  const c = document.createElement("canvas");
  c.width = Math.ceil(Math.max(rowW, badgeW) + pad * 2);
  c.height = Math.ceil(pad * 2 + label * 1.25 + value * 1.05 + 30 + badgeH);
  const ctx = c.getContext("2d")!;
  const left = (c.width - rowW) / 2;
  const top = pad;

  shadow(ctx);
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillStyle = "#fff";
  ctx.globalAlpha = 0.85;
  ctx.font = `600 ${label}px ${family}`;
  ctx.fillText("GOAL", left, top);
  ctx.fillText("FINISHED", left + goalW + arrowGap * 2, top);
  ctx.globalAlpha = 0.6;
  ctx.font = `800 ${value}px ${family}`;
  ctx.fillText(duration(goalSecs), left, top + label * 1.25);
  ctx.globalAlpha = 1;
  ctx.fillText(duration(actualSecs), left + goalW + arrowGap * 2, top + label * 1.25);

  // Arrow between the two times.
  const ay = top + label * 1.25 + value * 0.5;
  const ax0 = left + goalW + arrowGap * 0.45;
  const ax1 = left + goalW + arrowGap * 1.55;
  ctx.strokeStyle = beat || diff === 0 ? ROUTE_COLOR : "#fff";
  ctx.lineWidth = 10;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(ax0, ay);
  ctx.lineTo(ax1, ay);
  ctx.moveTo(ax1 - 22, ay - 22);
  ctx.lineTo(ax1, ay);
  ctx.lineTo(ax1 - 22, ay + 22);
  ctx.stroke();

  pill(
    ctx,
    badge,
    (c.width - badgeW) / 2,
    top + label * 1.25 + value * 1.05 + 30,
    badgeH,
    family,
    beat || diff === 0 ? ROUTE_COLOR : "rgba(255,255,255,0.18)",
    "#fff",
  );
  return toLayer(c);
}

export type Compare = "pace" | "time" | "distance" | "heartrate";

export const COMPARES: { key: Compare; label: string }[] = [
  { key: "pace", label: "Pace" },
  { key: "time", label: "Time" },
  { key: "distance", label: "Distance" },
  { key: "heartrate", label: "Avg HR" },
];

/** The compared number for one run: raw value (for maths) and how it's shown. */
export function compareValue(a: Activity, c: Compare, units: Units) {
  const len = units === "metric" ? 1000 : 1609.344;
  const unit = units === "metric" ? "km" : "mi";
  switch (c) {
    case "pace": {
      const raw = a.distance ? a.movingTime / (a.distance / len) : 0;
      return { label: "Avg pace", raw, text: `${duration(raw)} /${unit}` };
    }
    case "time":
      return { label: "Time", raw: a.movingTime, text: duration(a.movingTime) };
    case "distance":
      return { label: "Distance", raw: a.distance / len, text: `${(a.distance / len).toFixed(2)} ${unit}` };
    case "heartrate":
      return { label: "Avg HR", raw: a.avgHr ?? 0, text: a.avgHr ? `${Math.round(a.avgHr)} bpm` : "–" };
  }
}

/** Change from `then` to `now`: headline ("−1:25 /km"), detail ("21% faster"), and whether it's better. */
export function compareDelta(then: Activity, now: Activity, c: Compare, units: Units) {
  const a = compareValue(then, c, units).raw;
  const b = compareValue(now, c, units).raw;
  const diff = b - a;
  const unit = units === "metric" ? "km" : "mi";
  const pct = a ? Math.round((Math.abs(diff) / a) * 100) : 0;
  const sign = diff < 0 ? "−" : "+";
  // Lower is better for pace, time and heart rate; higher is better for distance.
  const improved = c === "distance" ? diff > 0 : diff < 0;
  const same = Math.abs(diff) < (c === "distance" ? 0.005 : 0.5);
  const words: Record<Compare, [string, string]> = {
    pace: ["faster", "slower"],
    time: ["faster", "slower"],
    distance: ["further", "shorter"],
    heartrate: ["lower HR", "higher HR"],
  };
  const headline =
    c === "pace"
      ? `${sign}${duration(Math.abs(diff))} /${unit}`
      : c === "time"
        ? `${sign}${duration(Math.abs(diff))}`
        : c === "distance"
          ? `${sign}${Math.abs(diff).toFixed(2)} ${unit}`
          : `${sign}${Math.round(Math.abs(diff))} bpm`;
  return {
    headline: same ? "Same" : headline,
    detail: same ? "no change" : `${pct}% ${words[c][improved ? 0 : 1]}`,
    improved: !same && improved,
    secondary: secondaryDelta(then, now, c, units),
  };
}

/**
 * The other half of the story: total time change when comparing pace or HR, pace change when comparing
 * time. Skipped for distance (different distances make time meaningless).
 */
function secondaryDelta(then: Activity, now: Activity, c: Compare, units: Units): string | null {
  if (c === "distance") return null;
  const other: Compare = c === "time" ? "pace" : "time";
  const diff = compareValue(now, other, units).raw - compareValue(then, other, units).raw;
  if (Math.abs(diff) < 0.5) return other === "time" ? "Same total time" : "Same pace";
  const sign = diff < 0 ? "−" : "+";
  const unit = units === "metric" ? "km" : "mi";
  const text = other === "time" ? `${sign}${duration(Math.abs(diff))} total time` : `${sign}${duration(Math.abs(diff))} /${unit} pace`;
  // Total time only compares fairly over (nearly) the same distance.
  const differentDistance = Math.abs(now.distance - then.distance) > then.distance * 0.02;
  return other === "time" && differentDistance ? `${text} · different distances` : text;
}

const monthYear = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", year: "numeric", timeZone: "UTC" }).toUpperCase();

/** THEN / NOW sticker: label + month, route, the compared value big, distance · time small. */
export async function renderVersusSticker(a: Activity, role: "then" | "now", c: Compare, units: Units) {
  await document.fonts?.ready;
  const family = fontFamily();
  const W = 760;
  const pad = 30;
  const len = units === "metric" ? 1000 : 1609.344;
  const unit = units === "metric" ? "km" : "mi";
  const value = compareValue(a, c, units);
  const route = a.polyline ? routeCanvas(a.polyline, 420) : null;
  const routeH = route ? Math.min(route.height, 420) : 0;
  const routeW = route ? (route.width * routeH) / route.height : 0;
  const pillH = 60;
  const gap = 28;
  const sub = c === "distance" ? duration(a.movingTime) : c === "time" ? `${(a.distance / len).toFixed(2)} ${unit}` : `${(a.distance / len).toFixed(2)} ${unit} · ${duration(a.movingTime)}`;

  const c2 = document.createElement("canvas");
  c2.width = W + pad * 2;
  c2.height = Math.ceil(pad * 2 + pillH + gap + (route ? routeH + gap : 0) + 36 * 1.2 + 120 * 1.18 + 44 * 1.3);
  const ctx = c2.getContext("2d")!;
  const cx = c2.width / 2;
  let y = pad;

  // Label pill + month, centered as one row.
  const label = role === "then" ? "THEN" : "NOW";
  const month = monthYear(a.date);
  const pw = pillWidth(family, pillH, label);
  ctx.font = `700 40px ${family}`;
  const mw = ctx.measureText(month).width;
  const rowX = cx - (pw + 18 + mw) / 2;
  pill(ctx, label, rowX, y, pillH, family, role === "now" ? ROUTE_COLOR : "rgba(255,255,255,0.22)", "#fff");
  shadow(ctx);
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText(month, rowX + pw + 18, y + pillH / 2 + 2);
  y += pillH + gap;

  if (route) {
    ctx.save();
    ctx.shadowColor = "transparent";
    ctx.drawImage(route, cx - routeW / 2, y, routeW, routeH);
    ctx.restore();
    y += routeH + gap;
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.globalAlpha = 0.85;
  ctx.font = `600 36px ${family}`;
  ctx.fillText(value.label.toUpperCase(), cx, y, W);
  y += 36 * 1.2;
  ctx.globalAlpha = 1;
  ctx.font = `800 120px ${family}`;
  ctx.fillText(value.text, cx, y, W);
  y += 120 * 1.18;
  ctx.globalAlpha = 0.85;
  ctx.font = `500 44px ${family}`;
  ctx.fillText(sub, cx, y, W);
  return toLayer(c2);
}

/** The difference badge: a solid card (orange when improved) with the headline and percentage. */
export async function renderDeltaSticker(then: Activity, now: Activity, c: Compare, units: Units) {
  await document.fonts?.ready;
  const family = fontFamily();
  const d = compareDelta(then, now, c, units);
  const m = document.createElement("canvas").getContext("2d")!;
  m.font = `900 110px ${family}`;
  const hw = m.measureText(d.headline).width;
  m.font = `700 46px ${family}`;
  const dw = m.measureText(d.detail.toUpperCase()).width;
  m.font = `800 56px ${family}`;
  const sw = d.secondary ? m.measureText(d.secondary).width : 0;
  const padX = 60;
  const padY = 34;
  const secondH = d.secondary ? 24 + 4 + 56 : 0; // divider gap + line
  const w = Math.max(hw, dw, sw) + padX * 2;
  const h = padY * 2 + 110 + 12 + 46 + secondH;
  const c2 = document.createElement("canvas");
  c2.width = Math.ceil(w + 20);
  c2.height = Math.ceil(h + 20);
  const ctx = c2.getContext("2d")!;
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 16;
  ctx.fillStyle = d.improved ? ROUTE_COLOR : "#2a2a2e";
  ctx.beginPath();
  ctx.roundRect(10, 10, w, h, 36);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.font = `900 110px ${family}`;
  ctx.fillText(d.headline, c2.width / 2, 10 + padY);
  ctx.globalAlpha = 0.9;
  ctx.font = `700 46px ${family}`;
  ctx.fillText(d.detail.toUpperCase(), c2.width / 2, 10 + padY + 110 + 12);
  if (d.secondary) {
    // Thin divider, then the overall change (total time, or pace when comparing time).
    const lineY = 10 + padY + 110 + 12 + 46 + 14;
    ctx.globalAlpha = 0.35;
    ctx.fillRect(10 + padX, lineY, w - padX * 2, 4);
    ctx.globalAlpha = 1;
    ctx.font = `800 56px ${family}`;
    ctx.fillText(d.secondary, c2.width / 2, lineY + 14);
  }
  return toLayer(c2);
}

/** Just the route, with a bolder line so it still reads when shrunk into a constellation or spiral. */
export async function renderRouteOnly(a: Activity) {
  return toLayer(routeCanvas(a.polyline!, 600, 0.05));
}
