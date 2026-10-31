import { getSession } from "@/app/lib/strava";

export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ athlete: null });
  return Response.json({ athlete: session.athlete });
}
