"use client";

import { useEffect, useState } from "react";
import type { Activity } from "@/app/lib/activity";
import { RunRow } from "./StravaPanel";
import type { Units } from "./stravaStickers";

async function fetchRuns(p: number): Promise<{ activities: Activity[]; hasMore: boolean } | { error: string }> {
  const res = await fetch(`/api/strava/activities?page=${p}`);
  if (!res.ok) return { error: res.status === 401 ? "Connect Strava first (Strava button in the toolbar)." : "Couldn't load runs." };
  return res.json();
}

/** Pick a different Strava run to put in a sticker's place (runs already on the canvas are hidden). */
export default function SwapRun({
  current,
  exclude,
  units,
  onPick,
}: {
  current: Activity;
  exclude: number[];
  units: Units;
  onPick: (a: Activity) => void;
}) {
  const [runs, setRuns] = useState<Activity[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function apply(p: number, data: { activities: Activity[]; hasMore: boolean } | { error: string }) {
    if ("error" in data) setError(data.error);
    else {
      setRuns((r) => (p === 1 ? data.activities : [...r, ...data.activities]));
      setHasMore(data.hasMore);
      setPage(p);
    }
    setLoading(false);
  }

  function loadMore() {
    setLoading(true);
    fetchRuns(page + 1).then((d) => apply(page + 1, d));
  }

  useEffect(() => {
    fetchRuns(1).then((d) => apply(1, d));
  }, []);

  const list = runs.filter((a) => a.id !== current.id && !exclude.includes(a.id));

  return (
    <div>
      <p className="mb-3 text-xs text-white/50">
        Replacing <b className="text-white/80">{current.name}</b>. The new run keeps this sticker&apos;s spot, size, design and color.
      </p>
      {error && <p className="mb-3 rounded-xl bg-red-500/15 p-3 text-sm text-red-200">{error}</p>}
      <div className="flex flex-col gap-1">
        {list.map((a) => (
          <RunRow key={a.id} run={a} units={units} on={false} onClick={() => onPick(a)} />
        ))}
      </div>
      {loading && <p className="py-4 text-center text-sm text-white/50">Loading…</p>}
      {!loading && hasMore && page > 0 && (
        <button onClick={loadMore} className="mt-3 h-11 w-full rounded-full bg-white/10 text-sm font-medium">
          Load more
        </button>
      )}
    </div>
  );
}
