import { NextResponse, type NextRequest } from "next/server";
import { credentials, originOf, STATE_COOKIE } from "@/app/lib/strava";

export async function GET(req: NextRequest) {
  const { id } = credentials();
  const origin = originOf(req);
  const state = crypto.randomUUID();
  // The mobile endpoint hands off to the Strava app when it's installed.
  const mobile = /iPhone|iPad|Android/i.test(req.headers.get("user-agent") ?? "");
  const url = new URL(`https://www.strava.com/oauth/${mobile ? "mobile/" : ""}authorize`);
  url.search = new URLSearchParams({
    client_id: id,
    redirect_uri: `${origin}/api/strava/callback`,
    response_type: "code",
    approval_prompt: "auto",
    scope: "read,activity:read_all",
    state,
  }).toString();

  const res = NextResponse.redirect(url);
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
    secure: origin.startsWith("https"),
  });
  return res;
}
