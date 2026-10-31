import type { NextRequest } from "next/server";
import { stravaGet } from "@/app/lib/strava";
import { isRunning, toActivity, type StravaActivity } from "@/app/lib/activity";

// Strava can't filter by sport, so fetch big pages and keep only runs.
const PER_PAGE = 60;

export async function GET(req: NextRequest) {
  const page = Number(req.nextUrl.searchParams.get("page") ?? 1) || 1;
  const data = await stravaGet<StravaActivity[]>(`/athlete/activities?per_page=${PER_PAGE}&page=${page}`);
  if (data instanceof Response) return data;
  return Response.json({
    activities: data.filter((a) => isRunning(a.sport_type)).map(toActivity),
    hasMore: data.length === PER_PAGE,
  });
}
