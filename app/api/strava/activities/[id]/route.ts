import type { NextRequest } from "next/server";
import { stravaGet } from "@/app/lib/strava";
import { toActivity, type StravaActivity } from "@/app/lib/activity";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/strava/activities/[id]">) {
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return Response.json({ error: "bad_id" }, { status: 400 });
  const data = await stravaGet<StravaActivity>(`/activities/${id}`);
  if (data instanceof Response) return data;
  return Response.json({ activity: toActivity(data) });
}
