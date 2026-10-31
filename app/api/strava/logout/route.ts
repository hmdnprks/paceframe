import { SESSION_COOKIE } from "@/app/lib/strava";
import { cookies } from "next/headers";

// Only clears our cookie. We deliberately don't call Strava's /deauthorize,
// since the same API app is shared with another project.
export async function POST() {
  (await cookies()).delete(SESSION_COOKIE);
  return Response.json({ ok: true });
}
