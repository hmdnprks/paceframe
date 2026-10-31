"use client";

import { useEffect, useState } from "react";
import type { Activity } from "@/app/lib/activity";
import { formatDate, renderStravaSticker, statsFor, type StickerKey, type Units } from "./stravaStickers";
import type { loadImage } from "./types";

type Layer = Awaited<ReturnType<typeof loadImage>>;
type Athlete = { id: number; firstname: string; lastname: string; profile: string };

const PAGE_SIZE = 20;

const ERRORS: Record<string, string> = {
  access_denied: "You cancelled the Strava login.",
  missing_activity_permission: "Please allow access to your activities so we can read your runs.",
  invalid_state: "Login expired, please try again.",
  token_exchange_failed: "Strava login failed. Check the client ID/secret in .env.local.",
};

export default function StravaPanel({
  hasWork,
  error,
  onAdd,
}: {
  hasWork: boolean;
  error: string | null;
  onAdd: (layers: Layer[]) => void;
}) {
  const [athlete, setAthlete] = useState<Athlete | null | undefined>(undefined);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState<Activity | null>(null);
  const [keys, setKeys] = useState<Set<StickerKey>>(new Set());
  const [units, setUnits] = useState<Units>("metric");
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState(error ? (ERRORS[error] ?? `Strava error: ${error}`) : null);

  async function loadPage(p: number) {
    setLoading(true);
    try {
      const res = await fetch(`/api/strava/activities?page=${p}`);
      if (res.status === 401) return setAthlete(null);
      if (!res.ok) return setMessage("Couldn't load activities from Strava. Try again in a bit.");
      const { activities: list } = (await res.json()) as { activities: Activity[] };
      setActivities((a) => (p === 1 ? list : [...a, ...list]));
      setHasMore(list.length === PAGE_SIZE);
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

  async function pick(a: Activity) {
    setPicked(a);
    setKeys(new Set(statsFor(a, units).map((s) => s.key)));
    // Detail has the full-resolution route and calories.
    const res = await fetch(`/api/strava/activities/${a.id}`);
    if (!res.ok) return;
    const { activity } = (await res.json()) as { activity: Activity };
    setPicked((cur) => (cur?.id === activity.id ? activity : cur));
    setKeys((k) => (activity.calories ? new Set([...k, "calories"]) : k));
  }

  async function add() {
    if (!picked) return;
    setAdding(true);
    try {
      const order = statsFor(picked, units).filter((s) => keys.has(s.key));
      const layers = await Promise.all(order.map((s) => renderStravaSticker(s.key, picked, units)));
      onAdd(layers);
    } finally {
      setAdding(false);
    }
  }

  async function logout() {
    await fetch("/api/strava/logout", { method: "POST" });
    setAthlete(null);
    setActivities([]);
    setPicked(null);
  }

  const toggle = (k: StickerKey) =>
    setKeys((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  const footer = <p className="mt-4 text-center text-[11px] font-semibold tracking-wide text-[#fc4c02]">POWERED BY STRAVA</p>;

  const notice = message && (
    <div className="mb-3 flex items-start justify-between gap-3 rounded-xl bg-red-500/15 p-3 text-sm text-red-200">
      <span>{message}</span>
      <button onClick={() => setMessage(null)} className="text-red-200/70" aria-label="Dismiss">
        ✕
      </button>
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

  if (picked) {
    const stats = statsFor(picked, units);
    return (
      <div>
        <button onClick={() => setPicked(null)} className="mb-3 text-sm text-white/60">
          ‹ Activities
        </button>
        <div className="mb-3">
          <div className="font-semibold">{picked.name}</div>
          <div className="text-xs text-white/50">{formatDate(picked.date)}</div>
        </div>

        <div className="mb-3 flex rounded-full bg-white/5 p-1 text-sm">
          {(["metric", "imperial"] as const).map((u) => (
            <button
              key={u}
              onClick={() => setUnits(u)}
              className={`h-9 flex-1 rounded-full font-medium ${units === u ? "bg-white text-black" : "text-white/60"}`}
            >
              {u === "metric" ? "km" : "miles"}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-1.5">
          {stats.map((s) => {
            const on = keys.has(s.key);
            return (
              <button
                key={s.key}
                onClick={() => toggle(s.key)}
                className={`flex h-14 items-center justify-between rounded-xl px-4 text-left ${on ? "bg-white/10" : "bg-white/[.03]"}`}
              >
                <div className="min-w-0">
                  <div className="text-[11px] tracking-wide text-white/50 uppercase">{s.label}</div>
                  <div className="truncate font-semibold">{s.value}</div>
                </div>
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-xs ${on ? "border-[#fc4c02] bg-[#fc4c02]" : "border-white/30"}`}
                >
                  {on && "✓"}
                </span>
              </button>
            );
          })}
        </div>

        <button
          onClick={add}
          disabled={adding || keys.size === 0}
          className="sticky bottom-0 mt-4 h-12 w-full rounded-full bg-[#fc4c02] font-semibold shadow-[0_-8px_20px_#18181b] active:brightness-90 disabled:opacity-40"
        >
          {adding ? "Creating stickers…" : `Add ${keys.size} sticker${keys.size === 1 ? "" : "s"}`}
        </button>
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
        <div className="flex-1 text-sm">
          <div className="font-semibold">
            {athlete.firstname} {athlete.lastname}
          </div>
          <div className="text-xs text-white/50">Pick an activity</div>
        </div>
        <button onClick={logout} className="h-8 rounded-full bg-white/10 px-3 text-xs">
          Log out
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        {activities.map((a) => (
          <button key={a.id} onClick={() => pick(a)} className="flex items-center justify-between rounded-xl bg-white/5 px-4 py-3 text-left active:bg-white/10">
            <div className="min-w-0">
              <div className="truncate font-semibold">{a.name}</div>
              <div className="text-xs text-white/50">
                {formatDate(a.date)} · {a.sport}
              </div>
            </div>
            <div className="shrink-0 pl-3 text-right text-sm font-semibold tabular-nums">
              {(a.distance / (units === "metric" ? 1000 : 1609.344)).toFixed(2)}
              <span className="ml-0.5 text-xs text-white/50">{units === "metric" ? "km" : "mi"}</span>
            </div>
          </button>
        ))}
      </div>

      {loading && <p className="py-4 text-center text-sm text-white/50">Loading…</p>}
      {!loading && activities.length === 0 && <p className="py-6 text-center text-sm text-white/50">No activities found.</p>}
      {!loading && hasMore && activities.length > 0 && (
        <button onClick={() => loadPage(page + 1)} className="mt-3 h-11 w-full rounded-full bg-white/10 text-sm font-medium">
          Load more
        </button>
      )}
      {footer}
    </div>
  );
}
