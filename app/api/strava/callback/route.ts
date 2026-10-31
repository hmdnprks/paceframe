import { NextResponse, type NextRequest } from "next/server";
import { cookieOptions, exchangeToken, originOf, SESSION_COOKIE, STATE_COOKIE, type Session } from "@/app/lib/strava";

export async function GET(req: NextRequest) {
  const origin = originOf(req);
  const params = req.nextUrl.searchParams;
  const fail = (reason: string) => NextResponse.redirect(`${origin}/?strava_error=${encodeURIComponent(reason)}`);

  if (params.get("error")) return fail(params.get("error")!);
  const code = params.get("code");
  if (!code || params.get("state") !== req.cookies.get(STATE_COOKIE)?.value) return fail("invalid_state");
  if (!params.get("scope")?.includes("activity:read")) return fail("missing_activity_permission");

  try {
    const t = await exchangeToken({ code, grant_type: "authorization_code" });
    const session: Session = {
      access_token: t.access_token,
      refresh_token: t.refresh_token,
      expires_at: t.expires_at,
      athlete: {
        id: t.athlete.id,
        firstname: t.athlete.firstname,
        lastname: t.athlete.lastname,
        profile: t.athlete.profile_medium ?? t.athlete.profile,
      },
    };
    const res = NextResponse.redirect(`${origin}/?strava=connected`);
    res.cookies.set(SESSION_COOKIE, JSON.stringify(session), cookieOptions(origin.startsWith("https")));
    res.cookies.delete(STATE_COOKIE);
    return res;
  } catch {
    return fail("token_exchange_failed");
  }
}
