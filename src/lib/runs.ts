import { sql } from "../db/client";

export type Run = {
  id: number;
  sport: string;
  start_time: string;
  name: string | null;
  distance_m: number | null;
  duration_s: number | null;
  avg_pace_s_km: number | null;
  avg_hr: number | null;
  training_load: number | null;
  elevation_m: number | null;
};

// Recent runs (run + trail_run), newest first.
export async function recentRuns(limit = 60): Promise<Run[]> {
  return sql<Run[]>`
    select id, sport, start_time, name, distance_m, duration_s,
           avg_pace_s_km, avg_hr, training_load, elevation_m
    from activity
    where sport in ('run', 'trail_run')
    order by start_time desc
    limit ${limit}
  `;
}

export type WeekSummary = {
  week: string; // ISO week start (Mon)
  runs: number;
  distance_km: number;
  duration_s: number;
  load: number;
};

// Weekly training volume for the last N weeks (running only).
export async function weeklyVolume(weeks = 12): Promise<WeekSummary[]> {
  return sql<WeekSummary[]>`
    select
      to_char(date_trunc('week', start_time), 'YYYY-MM-DD')  as week,
      count(*)::int                                          as runs,
      round(coalesce(sum(distance_m), 0) / 1000.0, 1)        as distance_km,
      coalesce(sum(duration_s), 0)::int                      as duration_s,
      round(coalesce(sum(training_load), 0), 0)              as load
    from activity
    where sport in ('run', 'trail_run')
      and start_time >= date_trunc('week', now()) - (${weeks} * interval '1 week')
    group by 1
    order by 1
  `;
}
