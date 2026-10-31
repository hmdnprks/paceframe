import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

export const SESSION_COOKIE = "strava_session";
export const STATE_COOKIE = "strava_oauth_state";

export type Session = {
  access_token: string;
  refresh_token: string;
  expires_at: number; // unix seconds
  athlete: { id: number; firstname: string; lastname: string; profile: string };
};

const API = "https://www.strava.com/api/v3";

export function credentials() {
  const id = process.env.STRAVA_CLIENT_ID;
  const secret = process.env.STRAVA_CLIENT_SECRET;
  if (!id || !secret) throw new Error("STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET missing in .env.local");
  return { id, secret };
}

/** Origin the browser used, so the OAuth redirect comes back to the same host (localhost, LAN IP, or prod). */
export function originOf(req: NextRequest) {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
  const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
  return `${proto}://${host}`;
}

export const cookieOptions = (secure: boolean) => ({
  httpOnly: true,
  secure,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 180,
});

export async function exchangeToken(params: Record<string, string>) {
  const { id, secret } = credentials();
  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: id, client_secret: secret, ...params }),
  });
  if (!res.ok) throw new Error(`Strava token error ${res.status}: ${await res.text()}`);
  return res.json();
}

/** Read the session cookie, refreshing the access token when it is about to expire. */
export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  let session: Session;
  try {
    session = JSON.parse(raw);
  } catch {
    return null;
  }
  if (session.expires_at - 120 > Date.now() / 1000) return session;

  try {
    const t = await exchangeToken({ grant_type: "refresh_token", refresh_token: session.refresh_token });
    session = { ...session, access_token: t.access_token, refresh_token: t.refresh_token, expires_at: t.expires_at };
    store.set(SESSION_COOKIE, JSON.stringify(session), cookieOptions(process.env.NODE_ENV === "production"));
    return session;
  } catch {
    store.delete(SESSION_COOKIE);
    return null;
  }
}

export async function stravaGet<T>(path: string): Promise<T | Response> {
  const session = await getSession();
  if (!session) return Response.json({ error: "not_logged_in" }, { status: 401 });
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${session.access_token}` } });
  if (res.status === 401) return Response.json({ error: "not_logged_in" }, { status: 401 });
  if (!res.ok) return Response.json({ error: `strava_${res.status}` }, { status: res.status });
  return (await res.json()) as T;
}
