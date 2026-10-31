import type { NextRequest } from "next/server";
import { stravaGet } from "@/app/lib/strava";
import { isRunning, toActivity, type Activity, type StravaActivity } from "@/app/lib/activity";

const PER_PAGE = 200; // Strava's max
const MAX_PAGES = 5; // ≤ 1000 activities per request, keeps us far from rate limits

/** All runs between `after` and `before` (unix seconds), for random picking. */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const after = Number(q.get("after"));
  const before = Number(q.get("before"));
  if (!Number.isFinite(after) || !Number.isFinite(before) || after >= before) {
    return Response.json({ error: "bad_range" }, { status: 400 });
  }

  const runs: Activity[] = [];
  let truncated = false;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const data = await stravaGet<StravaActivity[]>(
      `/athlete/activities?after=${Math.floor(after)}&before=${Math.floor(before)}&per_page=${PER_PAGE}&page=${page}`,
    );
    if (data instanceof Response) return data;
    runs.push(...data.filter((a) => isRunning(a.sport_type)).map(toActivity));
    if (data.length < PER_PAGE) break;
    truncated = page === MAX_PAGES;
  }
  return Response.json({ runs, truncated });
}
