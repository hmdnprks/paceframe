"use client";

import { useEffect, useState } from "react";
import { Dices, Minus, Plus } from "lucide-react";
import type { Activity } from "@/app/lib/activity";
import { RunRow, type RunSource } from "./StravaPanel";
import type { Units } from "./stravaStickers";

async function fetchRange(source: RunSource): Promise<Activity[] | { error: string }> {
  const res = await fetch(`/api/strava/runs?after=${source.after}&before=${source.before}`);
  if (!res.ok) return { error: res.status === 401 ? "Connect Strava first (Strava button in the toolbar)." : "Couldn't load runs." };
  return ((await res.json()) as { runs: Activity[] }).runs;
}

/** Add more runs to a group, only from the date range the group was made from. */
export default function AddRuns({
  source,
  exclude,
  units,
  busy,
  onAdd,
}: {
  source: RunSource;
  exclude: number[];
  units: Units;
  busy: boolean;
  onAdd: (runs: Activity[]) => void;
}) {
  const [runs, setRuns] = useState<Activity[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const [count, setCount] = useState(1);

  useEffect(() => {
    fetchRange(source).then((r) => {
      if ("error" in r) setError(r.error);
      else setRuns(r.sort((a, b) => b.date.localeCompare(a.date)));
    });
  }, [source]);

  const available = (runs ?? []).filter((a) => !exclude.includes(a.id) && a.polyline);
  const toggle = (id: number) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  function addRandom() {
    const pool = [...available];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    onAdd(pool.slice(0, count));
  }

  return (
    <div>
      <p className="mb-3 text-xs text-white/50">
        From <b className="text-white/80">{source.label}</b>, the same range as this group. Runs already on the canvas are hidden.
      </p>
      {error && <p className="mb-3 rounded-xl bg-red-500/15 p-3 text-sm text-red-200">{error}</p>}
      {!runs && !error && <p className="py-6 text-center text-sm text-white/50">Loading runs…</p>}

      {runs && (
        <>
          <div className="mb-3 flex items-center gap-2 rounded-2xl bg-white/5 p-2">
            <button
              onClick={() => setCount((c) => Math.max(1, c - 1))}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10"
              aria-label="Fewer"
            >
              <Minus size={16} />
            </button>
            <span className="w-8 text-center text-lg font-bold tabular-nums">{count}</span>
            <button
              onClick={() => setCount((c) => Math.min(available.length || 1, c + 1))}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10"
              aria-label="More"
            >
              <Plus size={16} />
            </button>
            <button
              onClick={addRandom}
              disabled={busy || !available.length}
              className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-white text-sm font-semibold text-black disabled:opacity-40"
            >
              <Dices size={16} />
              Add {count} random
            </button>
          </div>

          <div className="mb-1 text-xs text-white/50">Or pick runs ({available.length} available)</div>
          <div className="flex max-h-[40dvh] flex-col gap-1 overflow-y-auto rounded-xl bg-black/20 p-2">
            {available.map((a) => (
              <RunRow key={a.id} run={a} units={units} on={picked.includes(a.id)} onClick={() => toggle(a.id)} />
            ))}
            {!available.length && <p className="p-3 text-center text-xs text-white/50">Every run from this range is already on the canvas.</p>}
          </div>

          <button
            onClick={() => onAdd(available.filter((a) => picked.includes(a.id)))}
            disabled={busy || !picked.length}
            className="mt-3 h-12 w-full rounded-full bg-[#fc4c02] font-semibold active:brightness-90 disabled:opacity-40"
          >
            {busy ? "Adding…" : picked.length ? `Add ${picked.length} run${picked.length > 1 ? "s" : ""}` : "Pick runs to add"}
          </button>
        </>
      )}
    </div>
  );
}
