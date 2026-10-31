/** Subset of Strava's activity payload we use. */
export type StravaActivity = {
  id: number;
  name: string;
  sport_type: string;
  start_date_local: string;
  distance: number; // m
  moving_time: number; // s
  elapsed_time: number; // s
  total_elevation_gain: number; // m
  average_speed: number; // m/s
  average_heartrate?: number;
  max_heartrate?: number;
  average_cadence?: number;
  /** Runs: 0 default, 1 race, 2 long run, 3 workout. */
  workout_type?: number | null;
  calories?: number;
  kilojoules?: number;
  map?: { polyline?: string | null; summary_polyline?: string | null };
};

/** Compact, client-safe activity shape. */
export type Activity = {
  id: number;
  name: string;
  sport: string;
  date: string;
  distance: number;
  movingTime: number;
  elapsedTime: number;
  elevation: number;
  avgSpeed: number;
  avgHr?: number;
  maxHr?: number;
  cadence?: number;
  calories?: number;
  polyline?: string;
  race?: boolean;
};

const RUN_TYPES = new Set(["Run", "TrailRun", "VirtualRun"]);

export const isRunning = (sportType: string) => RUN_TYPES.has(sportType);

export function toActivity(a: StravaActivity): Activity {
  const run = /Run|Walk|Hike/.test(a.sport_type);
  return {
    id: a.id,
    name: a.name,
    sport: a.sport_type,
    date: a.start_date_local,
    distance: a.distance,
    movingTime: a.moving_time,
    elapsedTime: a.elapsed_time,
    elevation: a.total_elevation_gain,
    avgSpeed: a.average_speed,
    avgHr: a.average_heartrate,
    maxHr: a.max_heartrate,
    // Strava reports running cadence per leg; double it for steps per minute.
    cadence: a.average_cadence ? Math.round(a.average_cadence * (run ? 2 : 1)) : undefined,
    calories: a.calories || undefined,
    polyline: a.map?.polyline || a.map?.summary_polyline || undefined,
    race: a.workout_type === 1,
  };
}
