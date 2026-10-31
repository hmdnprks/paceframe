import { NextResponse, type NextRequest } from "next/server";
import { credentials, originOf, STATE_COOKIE } from "@/app/lib/strava";
import { seal } from "@/app/lib/seal";

export async function GET(req: NextRequest) {
  const { id } = credentials();
  const origin = originOf(req);
  // ?app=1: started from the installed (home screen) app, whose cookies are separate from Safari's.
  const app = req.nextUrl.searchParams.get("app") === "1";
  // Sealed state works even if the login finishes in a different browser context than it started in.
  const state = await seal({ n: crypto.randomUUID(), app }, 600);
  // The mobile endpoint hands off to the Strava app when it's installed, which returns via Safari;
  // the installed web app uses the web flow to stay in its own window.
  const mobile = !app && /iPhone|iPad|Android/i.test(req.headers.get("user-agent") ?? "");
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
