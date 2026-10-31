import { NextResponse, type NextRequest } from "next/server";
import { cookieOptions, exchangeToken, originOf, SESSION_COOKIE, STATE_COOKIE, type Session } from "@/app/lib/strava";
import { seal, unseal } from "@/app/lib/seal";

export async function GET(req: NextRequest) {
  const origin = originOf(req);
  const params = req.nextUrl.searchParams;
  const fail = (reason: string) => NextResponse.redirect(`${origin}/?strava_error=${encodeURIComponent(reason)}`);

  if (params.get("error")) return fail(params.get("error")!);
  const code = params.get("code");
  const state = params.get("state") ?? "";
  const st = await unseal<{ n: string; app: boolean }>(state);
  // The state must be ours and fresh. It must also match this browser's cookie, except when login started
  // in the installed app and iOS finished it in Safari (different cookie storage).
  const cookieState = req.cookies.get(STATE_COOKIE)?.value;
  if (!code || !st || (cookieState ? cookieState !== state : !st.app)) return fail("invalid_state");
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
    // From the installed app: also hand over a short-lived sealed login code, in case iOS
    // finished the login in Safari and the app has to pick it up by pasting the code.
    const handoff = st.app ? `&handoff=${await seal(session, 600)}` : "";
    const res = NextResponse.redirect(`${origin}/?strava=connected${handoff}`);
    res.cookies.set(SESSION_COOKIE, JSON.stringify(session), cookieOptions(origin.startsWith("https")));
    res.cookies.delete(STATE_COOKIE);
    return res;
  } catch {
    return fail("token_exchange_failed");
  }
}
