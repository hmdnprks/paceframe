import type { NextRequest } from "next/server";
import { stravaGet } from "@/app/lib/strava";
import { toActivity, type StravaActivity } from "@/app/lib/activity";

export async function GET(req: NextRequest) {
  const page = Number(req.nextUrl.searchParams.get("page") ?? 1) || 1;
  const data = await stravaGet<StravaActivity[]>(`/athlete/activities?per_page=20&page=${page}`);
  if (data instanceof Response) return data;
  return Response.json({ activities: data.map(toActivity) });
}
