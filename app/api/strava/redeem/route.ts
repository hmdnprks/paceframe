import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { cookieOptions, originOf, SESSION_COOKIE, type Session } from "@/app/lib/strava";
import { unseal } from "@/app/lib/seal";

/** Installed app: exchange a login code (copied from Safari after Strava login) for a session here. */
export async function POST(req: NextRequest) {
  const { code } = (await req.json().catch(() => ({}))) as { code?: string };
  const session = code ? await unseal<Session>(code) : null;
  if (!session?.refresh_token) return Response.json({ error: "invalid_or_expired" }, { status: 400 });
  (await cookies()).set(SESSION_COOKIE, JSON.stringify(session), cookieOptions(originOf(req).startsWith("https")));
  return Response.json({ athlete: session.athlete });
}
