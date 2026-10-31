"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Dices, Flag, GitCompareArrows, ImagePlus, Milestone, Minus, Plus, RefreshCw, Trophy, X } from "lucide-react";
import type { Activity } from "@/app/lib/activity";
import {
  buildWeeks,
  decodePolyline,
  duration as formatClock,
  formatDate,
  COMPARES,
  compareDelta,
  compareValue,
  renderDeltaSticker,
  recipeHasRoute,
  renderRecipe,
  type Compare,
  renderGoalSticker,
  resultSeconds,
  statsFor,
  defaultCardMetrics,
  type FinisherSource,
  type Recipe,
  type StickerKey,
  type Units,
} from "./stravaStickers";
import { honeyCols, type LayoutId, type LayoutOptions } from "./layouts";
import CardOptions, { ToggleRow, type CardSettings } from "./CardOptions";
import { paintFor, type Paint, type RouteStyle } from "./routeStyle";
import type { TextStyle } from "./textStyle";
import { isStandalone } from "./standalone";
import type { loadImage, Split } from "./types";

type Layer = Awaited<ReturnType<typeof loadImage>> & {
  edit?: FinisherSource;
  weight?: number;
  recipe?: Recipe;
  paint?: Paint;
  text?: TextStyle;
  /** Generated without a route (goal, difference badge), so route colors never touch it. */
  noRoute?: boolean;
};
type Athlete = { id: number; firstname: string; lastname: string; profile: string };

const ERRORS: Record<string, string> = {
  access_denied: "You cancelled the Strava login.",
  missing_activity_permission: "Please allow access to your activities so we can read your runs.",
  invalid_state: "Login expired, please try again.",
  invalid_or_expired: "That login code is invalid or expired (codes last 10 minutes). Connect again to get a new one.",
  token_exchange_failed: "Strava login failed. Check the client ID/secret in .env.local.",
};

/** Distance buckets, in the user's unit. */
const FILTERS: Record<Units, { label: string; min: number; max: number }[]> = {
  metric: [
    { label: "All", min: 0, max: Infinity },
    { label: "< 5 km", min: 0, max: 5 },
    { label: "5–10 km", min: 5, max: 10 },
    { label: "10–21 km", min: 10, max: 21.1 },
    { label: "21 km+", min: 21.1, max: Infinity },
  ],
  imperial: [
    { label: "All", min: 0, max: Infinity },
    { label: "< 3 mi", min: 0, max: 3 },
    { label: "3–6 mi", min: 3, max: 6.2 },
    { label: "6–13 mi", min: 6.2, max: 13.1 },
    { label: "13 mi+", min: 13.1, max: Infinity },
  ],
};

const RANGES = [
  { id: "1", label: "1 month" },
  { id: "3", label: "3 months" },
  { id: "6", label: "6 months" },
  { id: "12", label: "12 months" },
  { id: "custom", label: "Custom" },
] as const;
type RangeId = (typeof RANGES)[number]["id"];

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Unix-seconds window for a preset ("last N months") or a custom from/to (inclusive days, local time). */
function rangeWindow(range: RangeId, from: string, to: string) {
  if (range === "custom") {
    const a = new Date(`${from}T00:00:00`).getTime() / 1000;
    const b = new Date(`${to}T23:59:59`).getTime() / 1000;
    return Number.isFinite(a) && Number.isFinite(b) && a < b ? { after: a, before: b } : null;
  }
  const start = new Date();
  start.setMonth(start.getMonth() - Number(range));
  return { after: start.getTime() / 1000, before: Date.now() / 1000 };
}

const MAX_RANDOM = 50;

type Tool = "random" | "timeline" | "result" | "versus";

/** Within ±15% distance, so a 5K isn't compared with a marathon. */
const similarDistance = (a: Activity, b: Activity) => Math.abs(a.distance - b.distance) <= b.distance * 0.15;

function shuffle<T>(list: T[]) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const unitLen = (u: Units) => (u === "metric" ? 1000 : 1609.344);

type Mode = "combined" | "separate" | "routes";
type Settings = { keys: StickerKey[]; units: Units; mode: Mode };

const SETTINGS_KEY = "paceframe:strava-settings";
const DEFAULT_SETTINGS: Settings = { keys: ["route", "distance", "pace", "time"], units: "metric", mode: "combined" };

// Remembered per device; storage can be unavailable (private mode), so never rely on it.
function readSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(s: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {}
}

const STICKER_LABELS: Record<StickerKey, string> = {
  route: "Route map",
  distance: "Distance",
  pace: "Pace / speed",
  time: "Time",
  elevation: "Elevation gain",
  heartrate: "Avg heart rate",
  cadence: "Cadence",
  calories: "Calories",
  date: "Date",
  title: "Title + date",
};

export default function StravaPanel({
  hasWork,
  error,
  onAdd,
  onThenNow,
  routeColors,
  textStyle,
}: {
  hasWork: boolean;
  error: string | null;
  /**
   * `perRow` = stickers per activity, so a grid can put one activity per row.
   * `layout` = apply this layout right away instead of asking.
   */
  onAdd: (layers: Layer[], perRow?: number, layout?: LayoutId, layoutOpts?: Partial<LayoutOptions>) => void;
  /** Then vs Now: [then, now, badge] stickers, the background split, and optional photos per half. */
  onThenNow: (layers: Layer[], split: Split, photos: (File | null)[]) => void;
  /** Route colors for new stickers (solid, gradient or multi-color). */
  routeColors: RouteStyle;
  /** Text size, metrics layout, font and color for new stickers. */
  textStyle: TextStyle;
}) {
  const [athlete, setAthlete] = useState<Athlete | null | undefined>(undefined);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [initial] = useState(readSettings);
  const [units, setUnits] = useState<Units>(initial.units);
  const [filter, setFilter] = useState(0);
  // Selection keeps tap order, which becomes sticker order.
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [step, setStep] = useState<"pick" | "stickers">("pick");
  const [keys, setKeys] = useState<Set<StickerKey>>(() => new Set(initial.keys));
  const [mode, setMode] = useState<Mode>(initial.mode);
  // Routes-only arrangement: a honeycomb "constellation" or a spiral (oldest in the center).
  const [routeStyle, setRouteStyle] = useState<"constellation" | "spiral">("constellation");
  useEffect(() => saveSettings({ keys: [...keys], units, mode }), [keys, units, mode]);
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState(error ? (ERRORS[error] ?? `Strava error: ${error}`) : null);

  // Random pick: N runs from a date range (respects the distance filter).
  const [tool, setTool] = useState<Tool | null>(null);
  const [randomCount, setRandomCount] = useState(5);
  const [range, setRange] = useState<RangeId>("3");
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return isoDay(d);
  });
  const [to, setTo] = useState(() => isoDay(new Date()));
  const [pool, setPool] = useState<{ key: string; runs: Activity[]; truncated: boolean } | null>(null);
  const [rolling, setRolling] = useState(false);
  const [randomInfo, setRandomInfo] = useState<string | null>(null);

  // Training timeline: a date range as one stop per week (or per run), in order.
  const [groupBy, setGroupBy] = useState<"week" | "run">("week");
  const [building, setBuilding] = useState(false);
  const [timelineInfo, setTimelineInfo] = useState<string | null>(null);
  // Installed app: login code copied from Safari (see the callback's handoff).
  const [codeDraft, setCodeDraft] = useState("");
  const [redeeming, setRedeeming] = useState(false);

  async function pasteCode() {
    let code = codeDraft.trim();
    if (!code) {
      try {
        code = (await navigator.clipboard.readText()).trim();
      } catch {
        return setMessage("Couldn't read the clipboard. Long-press the box and choose Paste.");
      }
    }
    if (!code) return;
    setRedeeming(true);
    try {
      const res = await fetch("/api/strava/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) return setMessage(ERRORS.invalid_or_expired);
      const { athlete } = (await res.json()) as { athlete: Athlete };
      setCodeDraft("");
      setMessage(null);
      setAthlete(athlete);
      loadPage(1);
    } finally {
      setRedeeming(false);
    }
  }

  // Race result: finisher card and/or goal vs actual for one run.
  const [resultId, setResultId] = useState<number | null>(null);
  // Card metrics are null until the user changes them, so each race gets sensible defaults.
  const [card, setCard] = useState<{ time: CardSettings["time"]; pr: boolean; metrics: CardSettings["metrics"] | null }>({
    time: "elapsed",
    pr: false,
    metrics: null,
  });
  const [goal, setGoal] = useState({ h: "", m: "", s: "" });
  const [withCard, setWithCard] = useState(true);
  const [withGoal, setWithGoal] = useState(true);

  // Then vs Now: two runs, what to compare, background split and optional photos.
  const [thenId, setThenId] = useState<number | null>(null);
  const [nowId, setNowId] = useState<number | null>(null);
  const [vsSlot, setVsSlot] = useState<"then" | "now">("then");
  const [compare, setCompare] = useState<Compare>("pace");
  const [vsSplit, setVsSplit] = useState<Split>("side");
  const [vsPhotos, setVsPhotos] = useState<(File | null)[]>([null, null]);
  const vsPhotoInput = useRef<HTMLInputElement>(null);
  const vsPhotoSlot = useRef(0);

  // Race finale: "auto" = latest run marked as Race in Strava, a run id, or null for none.
  const [heroChoice, setHeroChoice] = useState<number | "auto" | null>("auto");
  const [heroPicking, setHeroPicking] = useState(false);
  const [timelineHeroId, setTimelineHeroId] = useState<number | null>(null);

  async function loadPage(p: number) {
    setLoading(true);
    try {
      const res = await fetch(`/api/strava/activities?page=${p}`);
      if (res.status === 401) return setAthlete(null);
      if (!res.ok) return setMessage("Couldn't load activities from Strava. Try again in a bit.");
      const { activities: list, hasMore } = (await res.json()) as { activities: Activity[]; hasMore: boolean };
      setActivities((a) => (p === 1 ? list : [...a, ...list]));
      setHasMore(hasMore);
      setPage(p);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetch("/api/strava/me")
      .then((r) => r.json())
      .then(({ athlete }: { athlete: Athlete | null }) => {
        setAthlete(athlete);
        if (athlete) loadPage(1);
      })
      .catch(() => setAthlete(null));
  }, []);

  const band = FILTERS[units][filter];
  const visible = activities.filter((a) => {
    const d = a.distance / unitLen(units);
    return d >= band.min && d < band.max;
  });
  const known = (id: number) => activities.find((a) => a.id === id) ?? pool?.runs.find((a) => a.id === id);
  const selected = selectedIds.map(known).filter((a): a is Activity => !!a);

  const rangeLabel = range === "custom" ? `${from} → ${to}` : `last ${RANGES.find((x) => x.id === range)!.label}`;

  /** First/last day (YYYY-MM-DD) of the chosen range. */
  function rangeDays() {
    if (range === "custom") return { first: from, last: to };
    const d = new Date();
    d.setMonth(d.getMonth() - Number(range));
    return { first: isoDay(d), last: isoDay(new Date()) };
  }

  /** All runs in the chosen date range (cached per range). */
  async function loadPool(r: RangeId = range) {
    const win = rangeWindow(r, from, to);
    if (!win) {
      setMessage("Pick a valid date range (start before end).");
      return null;
    }
    const key = `${r}|${r === "custom" ? `${from}|${to}` : ""}`;
    if (pool?.key === key) return pool;
    const res = await fetch(`/api/strava/runs?after=${Math.floor(win.after)}&before=${Math.floor(win.before)}`);
    if (res.status === 401) {
      setAthlete(null);
      return null;
    }
    if (!res.ok) {
      setMessage("Couldn't load runs for that range. Try again in a bit.");
      return null;
    }
    const data = (await res.json()) as { runs: Activity[]; truncated: boolean };
    const next = { key, ...data };
    setPool(next);
    return next;
  }

  async function rollRandom() {
    setRolling(true);
    try {
      const current = await loadPool();
      if (!current) return;
      const r = FILTERS[units][filter];
      const eligible = current.runs.filter((a) => {
        const d = a.distance / unitLen(units);
        return d >= r.min && d < r.max;
      });
      if (!eligible.length) return setMessage("No runs match that date range and distance filter.");
      const picked = shuffle(eligible).slice(0, randomCount);
      setSelectedIds(picked.map((a) => a.id));
      setTimelineInfo(null);
      setRandomInfo(
        `${picked.length} random of ${eligible.length} runs · ${rangeLabel}${r.min > 0 || r.max < Infinity ? ` · ${r.label}` : ""}${current.truncated ? " (first 1000 activities)" : ""}`,
      );
      setTool(null);
      setStep("stickers");
    } finally {
      setRolling(false);
    }
  }

  function resolveHero(runs: Activity[]) {
    if (heroChoice === null) return null;
    if (heroChoice === "auto") return [...runs].reverse().find((r) => r.race) ?? null;
    return runs.find((r) => r.id === heroChoice) ?? null;
  }

  /**
   * Render stickers in the chosen route colors. Gradients "across runs" and multi-color step per sticker
   * that has a route, so stat-only stickers don't skip colors. Each layer keeps its recipe for recoloring.
   */
  function renderBatch(recipes: Recipe[]): Promise<Layer[]> {
    const routed = recipes.filter(recipeHasRoute);
    return Promise.all(
      recipes.map(async (r) => {
        const paint = paintFor(routeColors, Math.max(0, routed.indexOf(r)), routed.length);
        return { ...(await renderRecipe(r, paint, textStyle)), recipe: r, paint, text: textStyle };
      }),
    );
  }

  /** The race as a big sticker: route, chosen metrics, title + date, RACE pill. */
  async function heroRecipe(hero: Activity): Promise<Recipe> {
    const res = await fetch(`/api/strava/activities/${hero.id}`);
    const detail = res.ok ? ((await res.json()) as { activity: Activity }).activity : hero;
    const heroKeys = new Set<StickerKey>([...keys, "route", "title"]);
    heroKeys.delete("date"); // the title already shows the date
    return { kind: "run", a: { ...detail, race: true }, keys: [...heroKeys], units };
  }

  async function openHeroPicker() {
    if (heroPicking) return setHeroPicking(false);
    setBuilding(true);
    try {
      if (await loadPool()) setHeroPicking(true);
    } finally {
      setBuilding(false);
    }
  }

  // Likely races first: Strava-marked races, then the longest runs.
  const byRaceLikelihood = (list: Activity[]) =>
    [...list].sort((a, b) => Number(!!b.race) - Number(!!a.race) || b.distance - a.distance).slice(0, 15);

  const resultRun = activities.find((a) => a.id === resultId) ?? null;
  const cardSettings: CardSettings | null = resultRun
    ? { time: card.time, pr: card.pr, metrics: card.metrics ?? defaultCardMetrics(resultRun) }
    : null;
  const goalSecs = (Number(goal.h) || 0) * 3600 + (Number(goal.m) || 0) * 60 + (Number(goal.s) || 0);

  // Runs from the searched range plus the loaded list, newest first.
  const vsRuns = [...new Map([...(pool?.runs ?? []), ...activities].map((a) => [a.id, a])).values()].sort((a, b) =>
    b.date.localeCompare(a.date),
  );
  const thenRun = vsRuns.find((a) => a.id === thenId) ?? null;
  const nowRun = vsRuns.find((a) => a.id === nowId) ?? null;
  // For "then", suggest runs of a similar distance to "now", oldest first.
  const vsCandidates =
    vsSlot === "now" || !nowRun
      ? vsRuns
      : [...vsRuns].sort((a, b) => Number(similarDistance(b, nowRun)) - Number(similarDistance(a, nowRun)) || a.date.localeCompare(b.date));
  const delta = thenRun && nowRun ? compareDelta(thenRun, nowRun, compare, units) : null;

  async function openVersus() {
    // A year back gives "then" something to compare against.
    const r: RangeId = range === "custom" ? "custom" : "12";
    setRange(r);
    setBuilding(true);
    try {
      const p = await loadPool(r);
      const runs = [...(p?.runs ?? []), ...activities].sort((a, b) => b.date.localeCompare(a.date));
      const now = runs.find((a) => a.id === (selectedIds.length === 1 ? selectedIds[0] : -1)) ?? runs[0];
      if (!now) return;
      const older = runs.filter((a) => a.id !== now.id && a.date < now.date);
      const then = [...older].reverse().find((a) => similarDistance(a, now)) ?? older[older.length - 1];
      setNowId(now.id);
      setThenId(then?.id ?? null);
      setVsSlot("then");
    } finally {
      setBuilding(false);
    }
  }

  async function createVersus() {
    if (!thenRun || !nowRun) return;
    setBuilding(true);
    try {
      const pair = await renderBatch([
        { kind: "versus", a: thenRun, role: "then", c: compare, units },
        { kind: "versus", a: nowRun, role: "now", c: compare, units },
      ]);
      const badge = { ...(await renderDeltaSticker(thenRun, nowRun, compare, units)), noRoute: true };
      onThenNow([...pair, badge], vsSplit, vsSplit === "none" ? [null, null] : vsPhotos);
    } finally {
      setBuilding(false);
    }
  }

  function toggleTool(t: Tool) {
    setTool((cur) => (cur === t ? null : t));
    if (t === "versus" && tool !== "versus") openVersus();
    // Race result defaults to the run selected in the grid, else the most likely race.
    if (t === "result" && tool !== "result") {
      if (selectedIds.length === 1) setResultId(selectedIds[0]);
      else if (!resultRun) setResultId(byRaceLikelihood(activities)[0]?.id ?? null);
    }
  }

  async function createResult() {
    if (!resultRun) return;
    setBuilding(true);
    try {
      const res = await fetch(`/api/strava/activities/${resultRun.id}`);
      const run = res.ok ? ((await res.json()) as { activity: Activity }).activity : resultRun;
      const settings = { ...cardSettings!, units };
      const layers: Layer[] = [];
      if (withCard) {
        const source: FinisherSource = { kind: "finisher", run, ...settings };
        const [card] = await renderBatch([{ kind: "finisher", source }]);
        layers.push({ ...card, edit: source });
      }
      if (withGoal && goalSecs > 0) layers.push({ ...(await renderGoalSticker(goalSecs, resultSeconds(run, settings.time))), noRoute: true });
      if (!layers.length) return setMessage("Turn on the finisher card, or enter a goal time.");
      onAdd(layers, undefined, layers.length > 1 ? "stack" : undefined);
    } finally {
      setBuilding(false);
    }
  }

  async function buildTimeline() {
    setBuilding(true);
    try {
      const current = await loadPool();
      if (!current) return;
      const hero = resolveHero(current.runs);
      // Only the chosen race is treated as the race (the RACE pill follows your pick, not Strava's tag).
      const runs = [...current.runs]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((r) => ({ ...r, race: hero ? r.id === hero.id : r.race }));
      if (groupBy === "week") {
        // Weekly totals use every run, so the distance filter doesn't apply here.
        const { first, last } = rangeDays();
        const weeks = buildWeeks(runs, first, last);
        const recipes: Recipe[] = weeks.map((w) => ({ kind: "week", w, units, raceDetails: !hero }));
        if (hero) recipes.push(await heroRecipe(hero));
        onAdd(await renderBatch(recipes), undefined, "timeline", { hero: !!hero });
        return;
      }
      const r = FILTERS[units][filter];
      const eligible = runs.filter((a) => {
        const d = a.distance / unitLen(units);
        return a.id !== hero?.id && d >= r.min && d < r.max;
      });
      if (!eligible.length) return setMessage("No runs match that date range and distance filter.");
      setSelectedIds([...eligible.map((a) => a.id), ...(hero ? [hero.id] : [])]);
      setTimelineHeroId(hero?.id ?? null);
      setKeys((k) => new Set([...k, "date"]));
      setRandomInfo(null);
      setTimelineInfo(
        `${eligible.length} runs, oldest first${hero ? ` · finale: ${hero.name}` : ""} · ${rangeLabel}${eligible.length > 30 ? " · tip: Weeks reads better with this many" : ""}`,
      );
      setTool(null);
      setStep("stickers");
    } finally {
      setBuilding(false);
    }
  }

  // Sticker kinds available across the selection, with how many activities have each.
  const count = new Map<StickerKey, number>();
  for (const a of selected) for (const s of statsFor(a, units)) count.set(s.key, (count.get(s.key) ?? 0) + 1);
  // Calories only come with activity detail; offer it and skip activities without it.
  if (selected.length) count.set("calories", count.get("calories") ?? 0);
  const kinds = (Object.keys(STICKER_LABELS) as StickerKey[]).filter((k) => count.has(k)).map((k) => ({ key: k, count: count.get(k)! }));

  const toggleActivity = (id: number) => {
    setRandomInfo(null);
    setTimelineInfo(null);
    setTimelineHeroId(null);
    setSelectedIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  const toggleKey = (k: StickerKey) =>
    setKeys((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  async function add() {
    setAdding(true);
    try {
      // Detail has the full-resolution route and calories. Skip it for big batches
      // so we stay well inside Strava's rate limits (summary routes are fine at sticker size).
      const detailed =
        selected.length > 10
          ? selected
          : await Promise.all(
              selected.map(async (a) => {
                const res = await fetch(`/api/strava/activities/${a.id}`);
                return res.ok ? ((await res.json()) as { activity: Activity }).activity : a;
              }),
            );
      if (timelineInfo) {
        const hero = detailed.find((a) => a.id === timelineHeroId);
        const ordered = detailed.filter((a) => a !== hero).sort((a, b) => a.date.localeCompare(b.date));
        const recipes: Recipe[] = ordered.map((a) => ({ kind: "run", a: { ...a, race: false }, keys: [...keys], units }));
        if (hero) recipes.push(await heroRecipe(hero));
        onAdd(await renderBatch(recipes), undefined, "timeline", { hero: !!hero });
        return;
      }
      if (mode === "routes") {
        // Oldest first, so a spiral starts in the center; distance lets the spiral size by run length.
        const runs = detailed.filter((a) => a.polyline).sort((a, b) => a.date.localeCompare(b.date));
        const rendered = await renderBatch(runs.map((a) => ({ kind: "routeOnly", a })));
        const layers = rendered.map((l, i) => ({ ...l, weight: runs[i].distance }));
        if (routeStyle === "constellation") onAdd(layers, undefined, "honeycomb", { cols: honeyCols(layers.length) });
        else onAdd(layers, undefined, "spiral", { bySize: true });
        return;
      }
      if (mode === "combined") {
        onAdd(await renderBatch(detailed.map((a) => ({ kind: "run", a, keys: [...keys], units }))));
        return;
      }
      const layers = await renderBatch(
        detailed.flatMap((a) =>
          statsFor(a, units)
            .filter((s) => keys.has(s.key))
            .map((s): Recipe => ({ kind: "stat", key: s.key, a, units })),
        ),
      );
      const perRow = Math.max(1, Math.round(layers.length / detailed.length));
      onAdd(layers, detailed.length > 1 ? perRow : undefined);
    } finally {
      setAdding(false);
    }
  }

  async function logout() {
    await fetch("/api/strava/logout", { method: "POST" });
    setAthlete(null);
    setActivities([]);
    setSelectedIds([]);
  }

  const footer = <p className="mt-4 text-center text-[11px] font-semibold tracking-wide text-[#fc4c02]">POWERED BY STRAVA</p>;

  const notice = message && (
    <div className="mb-3 flex items-start justify-between gap-3 rounded-xl bg-red-500/15 p-3 text-sm text-red-200">
      <span>{message}</span>
      <button onClick={() => setMessage(null)} className="shrink-0 text-red-200/70" aria-label="Dismiss">
        <X size={16} />
      </button>
    </div>
  );

  const rangePicker = (
    <>
          <div className="mb-1 text-xs text-white/50">From</div>
          <div className="mb-3 flex flex-wrap gap-2">
            {RANGES.map((r) => (
              <button
                key={r.id}
                onClick={() => setRange(r.id)}
                className={`h-8 rounded-full px-3.5 text-xs font-semibold ${range === r.id ? "bg-[#fc4c02] text-white" : "bg-white/10 text-white/70"}`}
              >
                {r.id === "custom" ? r.label : `Last ${r.label}`}
              </button>
            ))}
          </div>

          {range === "custom" && (
            <div className="mb-3 grid grid-cols-2 gap-2">
              <label className="text-xs text-white/50">
                Start
                <input
                  type="date"
                  value={from}
                  max={to}
                  onChange={(e) => setFrom(e.target.value)}
                  className="mt-1 h-11 w-full rounded-xl bg-white/10 px-3 text-sm text-white [color-scheme:dark]"
                />
              </label>
              <label className="text-xs text-white/50">
                End
                <input
                  type="date"
                  value={to}
                  min={from}
                  max={isoDay(new Date())}
                  onChange={(e) => setTo(e.target.value)}
                  className="mt-1 h-11 w-full rounded-xl bg-white/10 px-3 text-sm text-white [color-scheme:dark]"
                />
              </label>
            </div>
          )}
    </>
  );

  const unitToggle = (
    <div className="flex shrink-0 rounded-full bg-white/5 p-0.5 text-xs">
      {(["metric", "imperial"] as const).map((u) => (
        <button
          key={u}
          onClick={() => setUnits(u)}
          className={`h-7 rounded-full px-3 font-medium ${units === u ? "bg-white text-black" : "text-white/60"}`}
        >
          {u === "metric" ? "km" : "mi"}
        </button>
      ))}
    </div>
  );

  if (athlete === undefined) return <p className="py-10 text-center text-sm text-white/50">Checking Strava…</p>;

  if (athlete === null) {
    return (
      <div className="flex flex-col items-center gap-4 pb-2 text-center">
        {notice}
        <p className="text-sm text-white/70">Connect Strava to turn any activity into stickers: route, distance, pace, time and more.</p>
        {hasWork && (
          <p className="rounded-xl bg-white/5 p-3 text-xs text-white/60">
            Heads up: connecting reloads the page, so your current edit will be cleared. You only need to connect once.
          </p>
        )}
        <a
          // The installed app uses a login flow that tries to come back to the app instead of Safari.
          // (This panel only renders in the browser, so checking standalone here is safe.)
          href={`/api/strava/login${isStandalone() ? "?app=1" : ""}`}
          className="flex h-12 w-full items-center justify-center rounded-full bg-[#fc4c02] font-semibold active:brightness-90"
        >
          Connect with Strava
        </a>
        {isStandalone() && (
          <div className="w-full rounded-2xl bg-white/5 p-3 text-left">
            <div className="text-sm font-semibold">Logged in, but ended up in Safari?</div>
            <p className="mb-2 text-xs text-white/50">
              iPhone keeps the installed app separate from Safari. In Safari, tap <b>Copy code</b>, then come back here.
            </p>
            <div className="flex gap-2">
              <input
                value={codeDraft}
                onChange={(e) => setCodeDraft(e.target.value)}
                placeholder="Login code"
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                className="h-11 min-w-0 flex-1 rounded-xl bg-white/10 px-3 font-mono text-xs focus:ring-2 focus:ring-[#fc4c02] focus:outline-none"
              />
              <button
                onClick={pasteCode}
                disabled={redeeming}
                className="h-11 shrink-0 rounded-xl bg-white px-4 text-sm font-semibold text-black disabled:opacity-40"
              >
                {redeeming ? "…" : codeDraft ? "Use code" : "Paste code"}
              </button>
            </div>
          </div>
        )}
        {footer}
      </div>
    );
  }

  if (step === "stickers") {
    const total =
      mode === "routes" && !timelineInfo
        ? selected.filter((a) => a.polyline).length
        : mode === "combined" || timelineInfo
        ? selected.length
        : selected.reduce((n, a) => n + statsFor(a, units).filter((s) => keys.has(s.key)).length, 0);
    return (
      <div>
        <div className="mb-3 flex items-center justify-between">
          <button onClick={() => setStep("pick")} className="-ml-1 flex items-center gap-0.5 text-sm text-white/60">
            <ChevronLeft size={18} />
            Activities
          </button>
          {unitToggle}
        </div>
        {(randomInfo || timelineInfo) && (
          <div className="mb-4 rounded-xl bg-white/5 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="flex items-start gap-1.5 text-xs text-white/60">
                {randomInfo ? (
                  <Dices size={14} className="mt-px shrink-0 text-[#fc4c02]" />
                ) : (
                  <Milestone size={14} className="mt-px shrink-0 text-[#fc4c02]" />
                )}
                {randomInfo ?? timelineInfo}
              </span>
              {randomInfo && (
              <button
                onClick={rollRandom}
                disabled={rolling}
                className="flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-3 text-xs font-semibold disabled:opacity-40"
              >
                <RefreshCw size={13} className={rolling ? "animate-spin" : ""} />
                Re-roll
              </button>
              )}
            </div>
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 [scrollbar-width:none]">
              {selected.map((a) => (
                <div key={a.id} className="w-24 shrink-0 overflow-hidden rounded-lg bg-[#101012]">
                  <div className="aspect-square">{a.polyline && <RouteThumb polyline={a.polyline} />}</div>
                  <div className="p-1.5">
                    <div className="text-xs font-bold tabular-nums">{(a.distance / unitLen(units)).toFixed(2)}</div>
                    <div className="truncate text-[10px] text-white/45">{formatDate(a.date)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <h3 className="font-semibold">Metrics</h3>
        <p className="mb-3 text-xs text-white/50">
          Same for {selected.length === 1 ? <b className="text-white/80">{selected[0].name}</b> : `all ${selected.length} runs`} · remembered for next time
        </p>

        {!timelineInfo && (
        <div className="mb-3 flex rounded-xl bg-white/5 p-1 text-sm">
          {(
            [
              ["combined", "Per run", "Route + metrics together"],
              ["separate", "Separate", "Each metric on its own"],
              ["routes", "Routes only", "Constellation or spiral"],
            ] as const
          ).map(([m, label, hint]) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 rounded-lg px-2 py-2 text-center ${mode === m ? "bg-white text-black" : "text-white/60"}`}
            >
              <div className="font-semibold">{label}</div>
              <div className={`text-[10px] ${mode === m ? "text-black/60" : "text-white/40"}`}>{hint}</div>
            </button>
          ))}
        </div>
        )}

        {mode === "routes" && !timelineInfo ? (
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["constellation", "Constellation", "Routes in a honeycomb pattern"],
                ["spiral", "Spiral", "Oldest in the center, longer runs bigger"],
              ] as const
            ).map(([st, label, hint]) => (
              <button
                key={st}
                onClick={() => setRouteStyle(st)}
                className={`rounded-xl p-3 text-left ${routeStyle === st ? "bg-white/15 ring-2 ring-[#fc4c02]" : "bg-white/5"}`}
              >
                <div className="font-semibold">{label}</div>
                <div className="text-[11px] text-white/50">{hint}</div>
              </button>
            ))}
            {selected.some((a) => !a.polyline) && (
              <p className="col-span-2 text-[11px] text-white/40">Runs without GPS (e.g. treadmill) are skipped.</p>
            )}
          </div>
        ) : (
        <div className="flex flex-col gap-1.5">
          {kinds.map(({ key, count }) => {
            const on = keys.has(key);
            const single = selected.length === 1 ? statsFor(selected[0], units).find((s) => s.key === key) : null;
            return (
              <button
                key={key}
                onClick={() => toggleKey(key)}
                className={`flex h-14 items-center justify-between rounded-xl px-4 text-left ${on ? "bg-white/10" : "bg-white/[.03]"}`}
              >
                <div className="min-w-0">
                  <div className="font-semibold">{STICKER_LABELS[key]}</div>
                  <div className="truncate text-xs text-white/50">
                    {single
                      ? single.value
                      : key === "calories"
                        ? "When available"
                        : count === selected.length
                          ? "All selected activities"
                          : `${count} of ${selected.length} activities`}
                  </div>
                </div>
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-xs ${on ? "border-[#fc4c02] bg-[#fc4c02]" : "border-white/30"}`}
                >
                  {on && <Check size={14} strokeWidth={3} />}
                </span>
              </button>
            );
          })}
        </div>
        )}

        <div className="sticky bottom-0 -mx-4 mt-4 bg-[#18181b] px-4 pt-2">
          <button
            onClick={add}
            disabled={adding || (mode === "routes" && !timelineInfo ? total === 0 : keys.size === 0)}
            className="h-12 w-full rounded-full bg-[#fc4c02] font-semibold active:brightness-90 disabled:opacity-40"
          >
            {adding ? "Creating stickers…" : total ? `Add ${total} sticker${total === 1 ? "" : "s"}` : "Add stickers"}
          </button>
        </div>
        {footer}
      </div>
    );
  }

  return (
    <div>
      {notice}
      <div className="mb-3 flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {athlete.profile?.startsWith("http") && <img src={athlete.profile} alt="" className="h-9 w-9 rounded-full" />}
        <div className="min-w-0 flex-1 text-sm">
          <div className="truncate font-semibold">
            {athlete.firstname} {athlete.lastname}
          </div>
          <div className="text-xs text-white/50">Your runs · tap to select one or more</div>
        </div>
        {unitToggle}
        <button onClick={logout} className="h-8 shrink-0 rounded-full bg-white/10 px-3 text-xs">
          Log out
        </button>
      </div>

      {visible.length > 1 && (
        <div className="mb-2 flex justify-end">
          <button
            onClick={() => {
              setRandomInfo(null);
              setTimelineInfo(null);
              setTimelineHeroId(null);
              setSelectedIds((ids) => [...ids, ...visible.map((a) => a.id).filter((id) => !ids.includes(id))]);
            }}
            className="text-xs font-semibold text-[#fc4c02]"
          >
            Select all shown ({visible.length})
          </button>
        </div>
      )}

      {/* Distance filter */}
      <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
        {FILTERS[units].map((f, i) => (
          <button
            key={f.label}
            onClick={() => setFilter(i)}
            className={`h-8 shrink-0 rounded-full px-3.5 text-xs font-semibold ${i === filter ? "bg-[#fc4c02] text-white" : "bg-white/10 text-white/70"}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="mb-3 grid grid-cols-4 gap-2">
        {(
          [
            ["random", "Random", Dices],
            ["timeline", "Timeline", Milestone],
            ["result", "Race result", Trophy],
            ["versus", "Then vs Now", GitCompareArrows],
          ] as const
        ).map(([t, label, Glyph]) => (
          <button
            key={t}
            onClick={() => toggleTool(t)}
            className={`flex h-14 flex-col items-center justify-center gap-1 rounded-xl text-[11px] leading-tight font-semibold ${tool === t ? "bg-white text-black" : "bg-white/10"}`}
          >
            <Glyph size={18} />
            {label}
          </button>
        ))}
      </div>

      {tool === "versus" && (
        <div className="mb-4 rounded-2xl bg-white/5 p-3">
          <p className="mb-3 text-xs text-white/60">Show how far you&apos;ve come: an older run against a recent one, with the difference.</p>
          {rangePicker}
          <button
            onClick={openVersus}
            disabled={building}
            className="mb-3 h-10 w-full rounded-xl bg-white/10 text-sm font-semibold disabled:opacity-40"
          >
            {building ? "Searching…" : "Search runs in this range"}
          </button>

          {/* Then / Now slots: tap one, then pick its run below. */}
          <div className="mb-2 grid grid-cols-2 gap-2">
            {(
              [
                ["then", "THEN", thenRun],
                ["now", "NOW", nowRun],
              ] as const
            ).map(([slot, label, run]) => (
              <button
                key={slot}
                onClick={() => setVsSlot(slot)}
                className={`flex items-center gap-2 rounded-xl p-2 text-left ${vsSlot === slot ? "bg-white/15 ring-2 ring-[#fc4c02]" : "bg-black/20"}`}
              >
                <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-[#101012]">{run?.polyline && <RouteThumb polyline={run.polyline} />}</div>
                <div className="min-w-0">
                  <div className={`text-[10px] font-bold ${slot === "now" ? "text-[#fc4c02]" : "text-white/60"}`}>{label}</div>
                  <div className="truncate text-xs font-semibold">{run ? formatDate(run.date) : "Pick a run"}</div>
                  {run && <div className="text-[11px] text-white/50">{compareValue(run, compare, units).text}</div>}
                </div>
              </button>
            ))}
          </div>
          <div className="mb-3 flex max-h-52 flex-col gap-1 overflow-y-auto rounded-xl bg-black/20 p-2">
            {vsCandidates.slice(0, 25).map((a) => (
              <RunRow
                key={a.id}
                run={a}
                units={units}
                on={(vsSlot === "then" ? thenId : nowId) === a.id}
                onClick={() => {
                  if (vsSlot === "then") setThenId(a.id);
                  else setNowId(a.id);
                  setVsSlot(vsSlot === "then" ? "now" : "then");
                }}
              />
            ))}
          </div>

          <div className="mb-1 text-xs text-white/50">Compare</div>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {COMPARES.map((c) => {
              const missing = c.key === "heartrate" && !(thenRun?.avgHr && nowRun?.avgHr);
              return (
                <button
                  key={c.key}
                  onClick={() => setCompare(c.key)}
                  disabled={missing}
                  className={`h-8 rounded-full px-3.5 text-xs font-semibold disabled:opacity-30 ${compare === c.key ? "bg-[#fc4c02] text-white" : "bg-white/10 text-white/70"}`}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
          {thenRun && nowRun && delta && (
            <p className={`mb-3 text-sm font-bold ${delta.improved ? "text-[#fc4c02]" : "text-white/60"}`}>
              {delta.headline} · {delta.detail}
              {delta.secondary && <span className="block text-xs font-semibold opacity-80">{delta.secondary}</span>}
              {!similarDistance(thenRun, nowRun) && compare !== "distance" && (
                <span className="block text-[11px] font-medium text-white/40">Tip: runs of a similar distance compare more fairly.</span>
              )}
            </p>
          )}

          <div className="mb-1 text-xs text-white/50">Background</div>
          <div className="mb-2 flex rounded-xl bg-black/20 p-1 text-xs">
            {(
              [
                ["side", "Side by side"],
                ["stacked", "Top & bottom"],
                ["none", "One photo"],
              ] as const
            ).map(([sp, label]) => (
              <button
                key={sp}
                onClick={() => setVsSplit(sp)}
                className={`h-9 flex-1 rounded-lg font-semibold ${vsSplit === sp ? "bg-white text-black" : "text-white/60"}`}
              >
                {label}
              </button>
            ))}
          </div>
          {vsSplit !== "none" && (
            <div className="mb-3 grid grid-cols-2 gap-2">
              {(["Then", "Now"] as const).map((label, i) => (
                <button
                  key={label}
                  onClick={() => {
                    vsPhotoSlot.current = i;
                    vsPhotoInput.current?.click();
                  }}
                  className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-black/20 px-2 text-xs font-semibold"
                >
                  {vsPhotos[i] ? <Check size={14} className="shrink-0 text-[#fc4c02]" /> : <ImagePlus size={14} className="shrink-0" />}
                  <span className="truncate">{vsPhotos[i] ? `${label} photo added` : `${label} photo (optional)`}</span>
                </button>
              ))}
              <input
                ref={vsPhotoInput}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setVsPhotos((p) => p.map((x, i) => (i === vsPhotoSlot.current ? f : x)));
                  e.target.value = "";
                }}
              />
            </div>
          )}

          <button
            onClick={createVersus}
            disabled={building || !thenRun || !nowRun || thenRun.id === nowRun.id}
            className="h-12 w-full rounded-full bg-[#fc4c02] font-semibold active:brightness-90 disabled:opacity-40"
          >
            {building ? "Creating…" : "Create Then vs Now"}
          </button>
        </div>
      )}

      {tool === "result" && (
        <div className="mb-4 rounded-2xl bg-white/5 p-3">
          <div className="mb-1 text-xs text-white/50">Race</div>
          <div className="mb-3 flex max-h-56 flex-col gap-1 overflow-y-auto rounded-xl bg-black/20 p-2">
            {byRaceLikelihood(activities).map((a) => (
              <RunRow key={a.id} run={a} units={units} on={resultId === a.id} onClick={() => setResultId(a.id)} />
            ))}
            {!activities.length && <p className="p-2 text-xs text-white/50">No runs loaded yet.</p>}
          </div>
          <p className="-mt-2 mb-3 text-[11px] text-white/40">Race not listed? Load more runs below, or select it in the grid first.</p>

          {resultRun && cardSettings && withCard && (
            <div className="mb-3">
              <CardOptions
                run={resultRun}
                units={units}
                value={cardSettings}
                onChange={(patch) => setCard((c) => ({ ...c, ...patch }))}
              />
            </div>
          )}

          <div className="mb-1 text-xs text-white/50">Goal time (optional)</div>
          <div className="mb-3 flex items-center gap-1.5">
            {(["h", "m", "s"] as const).map((k, i) => (
              <div key={k} className="flex flex-1 items-center gap-1.5">
                {i > 0 && <span className="text-lg font-bold text-white/40">:</span>}
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={2}
                  placeholder={k === "h" ? "h" : k === "m" ? "mm" : "ss"}
                  value={goal[k]}
                  onChange={(e) => setGoal((g) => ({ ...g, [k]: e.target.value.replace(/\D/g, "") }))}
                  onFocus={(e) => e.target.select()}
                  aria-label={k === "h" ? "Goal hours" : k === "m" ? "Goal minutes" : "Goal seconds"}
                  className="h-11 w-full min-w-0 rounded-xl bg-white/10 text-center text-lg font-bold tabular-nums placeholder:font-medium placeholder:text-white/30 focus:ring-2 focus:ring-[#fc4c02] focus:outline-none"
                />
              </div>
            ))}
          </div>
          {resultRun && goalSecs > 0 && (
            <p className="-mt-1 mb-3 text-xs font-semibold text-[#fc4c02]">
              {(() => {
                const diff = resultSeconds(resultRun, card.time) - goalSecs;
                return diff === 0
                  ? "Right on goal"
                  : `${formatClock(Math.abs(diff))} ${diff < 0 ? "under" : "over"} goal`;
              })()}
            </p>
          )}

          <div className="mb-3 flex flex-col gap-2">
            <ToggleRow label="Finisher card" on={withCard} onClick={() => setWithCard((v) => !v)} />
            <ToggleRow label="Goal vs actual" on={withGoal && goalSecs > 0} disabled={goalSecs === 0} onClick={() => setWithGoal((v) => !v)} />
          </div>

          <button
            onClick={createResult}
            disabled={building || !resultRun || (!withCard && !(withGoal && goalSecs > 0))}
            className="h-12 w-full rounded-full bg-[#fc4c02] font-semibold active:brightness-90 disabled:opacity-40"
          >
            {building ? "Creating…" : "Create race result"}
          </button>
        </div>
      )}

      {tool === "timeline" && (
        <div className="mb-4 rounded-2xl bg-white/5 p-3">
          <p className="mb-3 text-xs text-white/60">
            Lay out a training block in order, e.g. 19 weeks from your first session to race day. Pick <b>Custom</b> for exact dates.
          </p>
          {rangePicker}
          <div className="mb-1 text-xs text-white/50">Race finale</div>
          {(() => {
            const chosen = pool && heroChoice !== null ? resolveHero(pool.runs) : null;
            const label =
              heroChoice === null
                ? "No finale"
                : chosen
                  ? chosen.name
                  : heroChoice === "auto"
                    ? "Auto: your run marked as Race in Strava"
                    : "Pick a run in this range";
            return (
              <button
                onClick={openHeroPicker}
                disabled={building}
                className="mb-2 flex w-full items-center gap-3 rounded-xl bg-black/20 p-2.5 text-left disabled:opacity-50"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#101012] text-[#fc4c02]">
                  {chosen?.polyline ? <RouteThumb polyline={chosen.polyline} /> : <Flag size={18} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{label}</div>
                  <div className="truncate text-[11px] text-white/45">
                    {chosen
                      ? `${formatDate(chosen.date)} · ${(chosen.distance / unitLen(units)).toFixed(2)} ${units === "metric" ? "km" : "mi"}`
                      : "Shown big at the end of the timeline"}
                  </div>
                </div>
                <ChevronRight size={18} className={`shrink-0 text-white/40 transition ${heroPicking ? "rotate-90" : ""}`} />
              </button>
            );
          })()}
          {heroPicking && pool && (
            <div className="mb-3 rounded-xl bg-black/20 p-2">
              <div className="mb-2 flex gap-2">
                {(
                  [
                    ["auto", "Auto"],
                    [null, "None"],
                  ] as const
                ).map(([v, label]) => (
                  <button
                    key={label}
                    onClick={() => (setHeroChoice(v), setHeroPicking(false))}
                    className={`h-8 rounded-full px-3.5 text-xs font-semibold ${heroChoice === v ? "bg-[#fc4c02] text-white" : "bg-white/10 text-white/70"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
                {byRaceLikelihood(pool.runs).map((a) => (
                  <RunRow
                    key={a.id}
                    run={a}
                    units={units}
                    on={heroChoice === a.id}
                    onClick={() => (setHeroChoice(a.id), setHeroPicking(false))}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="mb-1 text-xs text-white/50">One stop per</div>
          <div className="mb-2 flex rounded-xl bg-black/20 p-1 text-sm">
            {(
              [
                ["week", "Week", "Total km, runs, long run"],
                ["run", "Run", "Your chosen metrics"],
              ] as const
            ).map(([g, label, hint]) => (
              <button
                key={g}
                onClick={() => setGroupBy(g)}
                className={`flex-1 rounded-lg px-2 py-2 text-center ${groupBy === g ? "bg-white text-black" : "text-white/60"}`}
              >
                <div className="font-semibold">{label}</div>
                <div className={`text-[10px] ${groupBy === g ? "text-black/60" : "text-white/40"}`}>{hint}</div>
              </button>
            ))}
          </div>
          <p className="mb-3 text-[11px] text-white/40">
            {groupBy === "week"
              ? "Weeks start on your start date. The race week gets a RACE badge; empty weeks show as rest."
              : `Distance filter applies: ${FILTERS[units][filter].label}`}
          </p>
          <button
            onClick={buildTimeline}
            disabled={building}
            className="h-12 w-full rounded-full bg-[#fc4c02] font-semibold active:brightness-90 disabled:opacity-40"
          >
            {building ? "Building timeline…" : groupBy === "week" ? "Build weekly timeline" : "Choose metrics"}
          </button>
        </div>
      )}

      {tool === "random" && (
        <div className="mb-4 rounded-2xl bg-white/5 p-3">
          <div className="mb-1 text-xs text-white/50">How many (1–{MAX_RANDOM})</div>
          <div className="mb-3 flex items-center gap-3">
            <button
              onClick={() => setRandomCount((c) => Math.max(1, c - 1))}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10"
              aria-label="Fewer"
            >
              <Minus size={18} />
            </button>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_RANDOM}
              value={randomCount || ""}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                setRandomCount(Number.isNaN(v) ? 0 : Math.min(MAX_RANDOM, Math.max(0, v)));
              }}
              onBlur={() => setRandomCount((c) => Math.max(1, c))}
              onFocus={(e) => e.target.select()}
              aria-label="Number of runs"
              className="h-11 min-w-0 flex-1 rounded-xl bg-white/10 text-center text-2xl font-bold tabular-nums [appearance:textfield] focus:ring-2 focus:ring-[#fc4c02] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <button
              onClick={() => setRandomCount((c) => Math.min(MAX_RANDOM, c + 1))}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10"
              aria-label="More"
            >
              <Plus size={18} />
            </button>
          </div>

          {rangePicker}

          <p className="mb-3 text-[11px] text-white/40">Distance filter applies: {FILTERS[units][filter].label}</p>
          <button
            onClick={rollRandom}
            disabled={rolling || randomCount < 1}
            className="h-12 w-full rounded-full bg-[#fc4c02] font-semibold active:brightness-90 disabled:opacity-40"
          >
            {rolling ? "Finding runs…" : `Pick ${randomCount} random run${randomCount === 1 ? "" : "s"}`}
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {visible.map((a) => {
          const order = selectedIds.indexOf(a.id);
          const on = order >= 0;
          return (
            <button
              key={a.id}
              onClick={() => toggleActivity(a.id)}
              className={`relative flex flex-col overflow-hidden rounded-2xl bg-white/5 text-left transition active:scale-[.98] ${on ? "ring-2 ring-[#fc4c02]" : ""}`}
            >
              <div className="relative aspect-square w-full bg-[#101012]">
                {a.polyline ? (
                  <RouteThumb polyline={a.polyline} />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-white/30">No route</div>
                )}
                <span
                  className={`absolute top-2 right-2 flex h-6 min-w-6 items-center justify-center rounded-full border-2 px-1 text-xs font-bold ${on ? "border-[#fc4c02] bg-[#fc4c02]" : "border-white/40 bg-black/30"}`}
                >
                  {on ? order + 1 : ""}
                </span>
              </div>
              <div className="p-2.5">
                <div className="flex items-baseline justify-between gap-2 tabular-nums">
                  <div className="text-lg leading-tight font-bold">
                    {(a.distance / unitLen(units)).toFixed(2)}
                    <span className="ml-0.5 text-xs font-medium text-white/50">{units === "metric" ? "km" : "mi"}</span>
                  </div>
                  {a.avgSpeed > 0 && (
                    <div className="truncate text-xs font-semibold text-white/80">
                      {statsFor(a, units).find((x) => x.key === "pace")?.value}
                    </div>
                  )}
                </div>
                <div className="truncate text-xs font-medium text-white/80">{a.name}</div>
                <div className="truncate text-[11px] text-white/45">
                  {formatDate(a.date)} · {a.sport}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {loading && <p className="py-4 text-center text-sm text-white/50">Loading…</p>}
      {!loading && visible.length === 0 && (
        <p className="py-6 text-center text-sm text-white/50">
          {activities.length ? "No runs in this distance range yet. Try Load more." : "No runs found yet. Try Load more."}
        </p>
      )}
      {!loading && hasMore && page > 0 && (
        <button onClick={() => loadPage(page + 1)} className="mt-3 h-11 w-full rounded-full bg-white/10 text-sm font-medium">
          Load more
        </button>
      )}
      {footer}

      {selectedIds.length > 0 && (
        <div className="sticky bottom-0 -mx-4 mt-3 flex items-center gap-2 bg-[#18181b] px-4 pt-2">
          <button onClick={() => (setSelectedIds([]), setRandomInfo(null), setTimelineInfo(null))} className="h-12 rounded-full bg-white/10 px-4 text-sm font-medium">
            Clear
          </button>
          <button
            onClick={() => setStep("stickers")}
            className="h-12 flex-1 rounded-full bg-[#fc4c02] font-semibold active:brightness-90"
          >
            Next · {selectedIds.length} selected
          </button>
        </div>
      )}
    </div>
  );
}

/** Compact run row for pickers: route thumb, name (flag if marked as Race), date, distance. */
export function RunRow({ run: a, units, on, onClick }: { run: Activity; units: Units; on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-2.5 rounded-lg p-1.5 text-left ${on ? "bg-white/10" : ""}`}>
      <div className="h-9 w-9 shrink-0 overflow-hidden rounded-md bg-[#101012]">{a.polyline && <RouteThumb polyline={a.polyline} />}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 truncate text-sm font-medium">
          {a.race && <Flag size={12} className="shrink-0 text-[#fc4c02]" />}
          <span className="truncate">{a.name}</span>
        </div>
        <div className="text-[11px] text-white/45">{formatDate(a.date)}</div>
      </div>
      <div className="shrink-0 text-sm font-semibold tabular-nums">
        {(a.distance / unitLen(units)).toFixed(2)}
        <span className="ml-0.5 text-[10px] text-white/50">{units === "metric" ? "km" : "mi"}</span>
      </div>
      {on && <Check size={16} className="shrink-0 text-[#fc4c02]" />}
    </button>
  );
}

/** Route preview as an SVG polyline fitted into a square. */
export function RouteThumb({ polyline }: { polyline: string }) {
  const d = useMemo(() => {
    const pts = decodePolyline(polyline);
    if (pts.length < 2) return "";
    const lat0 = (pts.reduce((s, p) => s + p[0], 0) / pts.length) * (Math.PI / 180);
    const xy = pts.map(([la, ln]) => [ln * Math.cos(lat0), -la]);
    const xs = xy.map((p) => p[0]);
    const ys = xy.map((p) => p[1]);
    const x0 = Math.min(...xs);
    const y0 = Math.min(...ys);
    const span = Math.max(Math.max(...xs) - x0, Math.max(...ys) - y0) || 1;
    const f = 80 / span;
    const ox = (100 - (Math.max(...xs) - x0) * f) / 2;
    const oy = (100 - (Math.max(...ys) - y0) * f) / 2;
    return xy.map((p, i) => `${i ? "L" : "M"}${(ox + (p[0] - x0) * f).toFixed(1)} ${(oy + (p[1] - y0) * f).toFixed(1)}`).join("");
  }, [polyline]);
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full">
      <path d={d} fill="none" stroke="#fc4c02" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
