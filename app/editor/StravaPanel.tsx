"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, Dices, Minus, Plus, RefreshCw, X } from "lucide-react";
import type { Activity } from "@/app/lib/activity";
import { decodePolyline, formatDate, renderRunSticker, renderStravaSticker, statsFor, type StickerKey, type Units } from "./stravaStickers";
import type { loadImage } from "./types";

type Layer = Awaited<ReturnType<typeof loadImage>>;
type Athlete = { id: number; firstname: string; lastname: string; profile: string };

const ERRORS: Record<string, string> = {
  access_denied: "You cancelled the Strava login.",
  missing_activity_permission: "Please allow access to your activities so we can read your runs.",
  invalid_state: "Login expired, please try again.",
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

function shuffle<T>(list: T[]) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const unitLen = (u: Units) => (u === "metric" ? 1000 : 1609.344);

type Mode = "combined" | "separate";
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
  title: "Title + date",
};

export default function StravaPanel({
  hasWork,
  error,
  onAdd,
}: {
  hasWork: boolean;
  error: string | null;
  /** `perRow` = stickers per activity, so a grid can put one activity per row. */
  onAdd: (layers: Layer[], perRow?: number) => void;
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
  useEffect(() => saveSettings({ keys: [...keys], units, mode }), [keys, units, mode]);
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState(error ? (ERRORS[error] ?? `Strava error: ${error}`) : null);

  // Random pick: N runs from a date range (respects the distance filter).
  const [randomOpen, setRandomOpen] = useState(false);
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

  async function rollRandom() {
    const win = rangeWindow(range, from, to);
    if (!win) return setMessage("Pick a valid date range (start before end).");
    const key = `${range}|${range === "custom" ? `${from}|${to}` : ""}`;
    setRolling(true);
    try {
      let current = pool?.key === key ? pool : null;
      if (!current) {
        const res = await fetch(`/api/strava/runs?after=${Math.floor(win.after)}&before=${Math.floor(win.before)}`);
        if (res.status === 401) return setAthlete(null);
        if (!res.ok) return setMessage("Couldn't load runs for that range. Try again in a bit.");
        const data = (await res.json()) as { runs: Activity[]; truncated: boolean };
        current = { key, ...data };
        setPool(current);
      }
      const r = FILTERS[units][filter];
      const eligible = current.runs.filter((a) => {
        const d = a.distance / unitLen(units);
        return d >= r.min && d < r.max;
      });
      if (!eligible.length) return setMessage("No runs match that date range and distance filter.");
      const picked = shuffle(eligible).slice(0, randomCount);
      setSelectedIds(picked.map((a) => a.id));
      const rangeLabel = range === "custom" ? `${from} → ${to}` : `last ${RANGES.find((x) => x.id === range)!.label}`;
      setRandomInfo(
        `${picked.length} random of ${eligible.length} runs · ${rangeLabel}${r.min > 0 || r.max < Infinity ? ` · ${r.label}` : ""}${current.truncated ? " (first 1000 activities)" : ""}`,
      );
      setRandomOpen(false);
      setStep("stickers");
    } finally {
      setRolling(false);
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
      // Detail has the full-resolution route and calories.
      const detailed = await Promise.all(
        selected.map(async (a) => {
          const res = await fetch(`/api/strava/activities/${a.id}`);
          return res.ok ? ((await res.json()) as { activity: Activity }).activity : a;
        }),
      );
      if (mode === "combined") {
        onAdd(await Promise.all(detailed.map((a) => renderRunSticker(a, keys, units))));
        return;
      }
      const jobs = detailed.flatMap((a) => statsFor(a, units).filter((s) => keys.has(s.key)).map((s) => renderStravaSticker(s.key, a, units)));
      const layers = await Promise.all(jobs);
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
          href="/api/strava/login"
          className="flex h-12 w-full items-center justify-center rounded-full bg-[#fc4c02] font-semibold active:brightness-90"
        >
          Connect with Strava
        </a>
        {footer}
      </div>
    );
  }

  if (step === "stickers") {
    const total =
      mode === "combined"
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
        {randomInfo && (
          <div className="mb-4 rounded-xl bg-white/5 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="flex items-start gap-1.5 text-xs text-white/60">
                <Dices size={14} className="mt-px shrink-0 text-[#fc4c02]" />
                {randomInfo}
              </span>
              <button
                onClick={rollRandom}
                disabled={rolling}
                className="flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-3 text-xs font-semibold disabled:opacity-40"
              >
                <RefreshCw size={13} className={rolling ? "animate-spin" : ""} />
                Re-roll
              </button>
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

        <div className="mb-3 flex rounded-xl bg-white/5 p-1 text-sm">
          {(
            [
              ["combined", "One sticker per run", "Route + metrics together"],
              ["separate", "Separate stickers", "Each metric on its own"],
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

        <div className="sticky bottom-0 -mx-4 mt-4 bg-[#18181b] px-4 pt-2">
          <button
            onClick={add}
            disabled={adding || keys.size === 0}
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

      <button
        onClick={() => setRandomOpen((o) => !o)}
        className={`mb-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold ${randomOpen ? "bg-white text-black" : "bg-white/10"}`}
      >
        <Dices size={18} />
        Pick random runs
      </button>

      {randomOpen && (
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
          <button onClick={() => (setSelectedIds([]), setRandomInfo(null))} className="h-12 rounded-full bg-white/10 px-4 text-sm font-medium">
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

/** Route preview as an SVG polyline fitted into a square. */
function RouteThumb({ polyline }: { polyline: string }) {
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
