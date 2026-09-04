import type { Achieved, MetricKey } from "./roadmap";
import { sql } from "../db/client";

export async function exerciseProgression(canonicalName: string) {
  return (await sql`
    select s.date, s.type as stimulus, e.metric_value, e.metric_type, e.load_type, e.load_value, e.load_unit
    from entry e
    join session s on s.id = e.session_id
    join exercise x on x.id = e.exercise_id
    where x.canonical_name = ${canonicalName} and e.skipped = false
    order by s.date asc
  `) as unknown as Array<{ date: string; stimulus: string | null; metric_value: number; load_value: number | null }>;
}

export async function muscleUpLadder() {
  return (await sql`
    select s.date, e.load_value, e.load_type, e.metric_value
    from entry e
    join session s on s.id = e.session_id
    join exercise x on x.id = e.exercise_id
    where x.canonical_name = 'Muscle-up' and e.skipped = false
    order by s.date asc
  `) as unknown as Array<{ date: string; load_value: number | null; load_type: string; metric_value: number }>;
}

export async function stalledLifts(n = 3) {
  return (await sql`
    with ranked as (
      select x.canonical_name, s.date, e.load_value, e.load_type,
             row_number() over (partition by e.exercise_id order by s.date desc) as rn
      from entry e
      join session s on s.id = e.session_id
      join exercise x on x.id = e.exercise_id
      where e.load_type in ('added','external') and e.skipped = false
    )
    select canonical_name,
           max(load_value) as recent_best,
           count(*) as sessions
    from ranked
    where rn <= ${n}
    group by canonical_name
    having count(*) >= ${n}
       and max(load_value) = min(load_value)
  `) as unknown as Array<{ canonical_name: string; recent_best: number; sessions: number }>;
}

const BEST_SET_WINDOW_DAYS = 90;

export async function prBoard(includeAll = false) {
  // Default: key lifts only (the visual board). includeAll drops the filter so the
  // generator can autoregulate off every tracked lift; un-logged ones come back null.
  //
  // The load columns stay all-time: they are PRs, and a PR does not expire.
  // `best_metric` is a different thing and used to be computed the same way —
  // max(metric_value) over every entry ever — which made it three unrelated
  // maxima on one row. It reported 7 chin-ups beside +12.5kg when the 7 came
  // from a +7.5kg session and a bodyweight one, and it sat on 4 muscle-ups from
  // June while the assist fell 15kg, because more reps always wins and an
  // unloaded set outranks a heavier one.
  //
  // It now names one set that actually happened: the most reps at the heaviest
  // load carried in the last 90 days, with that load alongside so the pairing is
  // visible rather than implied. An exercise not trained in the window has no
  // current best and reports null — which is the honest answer, and safer for
  // the generator than autoregulating off a number from April.
  return (await sql`
    with recent as (
      select e.exercise_id, e.metric_value, e.load_type, e.load_value
      from entry e
      join session s on s.id = e.session_id
      where e.skipped = false
        and s.date >= current_date - ${BEST_SET_WINDOW_DAYS}::int
    ),
    -- Heaviest load carried recently. Assistance is stored negative, so max()
    -- is "least assisted" there and "heaviest" everywhere else. Null means the
    -- exercise was only ever done unloaded in the window.
    top_load as (
      select exercise_id,
             max(load_value) filter (
               where load_type in ('added','external','assisted')
             ) as load_value
      from recent group by exercise_id
    ),
    best as (
      select r.exercise_id,
             max(r.metric_value) as best_metric,
             t.load_value as best_load,
             -- At one exact load_value the load_type is determined (-20 is
             -- assisted, +12.5 is added); min() just picks it deterministically.
             min(r.load_type) as best_load_type
      from recent r
      join top_load t on t.exercise_id = r.exercise_id
      where (t.load_value is null and r.load_type = 'bodyweight')
         or (t.load_value is not null and r.load_value = t.load_value)
      group by r.exercise_id, t.load_value
    )
    select e.id as exercise_id, e.canonical_name,
           p.max_added_load, p.min_assist_load, p.max_metric,
           b.best_metric, b.best_load, b.best_load_type
    from exercise e
    left join v_prs p on p.exercise_id = e.id
    left join best b on b.exercise_id = e.id
    ${includeAll ? sql`` : sql`where e.is_key`}
    order by e.canonical_name
  `) as unknown as Array<Record<string, unknown>>;
}

export async function allExercisePrs() {
  return (await sql`
    with history as (
      select e.exercise_id,
             json_agg(json_build_object(
               'date', s.date, 'load_type', e.load_type, 'load_value', e.load_value,
               'metric_value', e.metric_value, 'metric_type', e.metric_type
             ) order by s.date asc, e.id asc) as points
      from entry e
      join session s on s.id = e.session_id
      where e.skipped = false
      group by e.exercise_id
    )
    select
      x.id as exercise_id, x.canonical_name, x.is_key, x.family,
      p.max_added_load, p.min_assist_load, p.max_metric,
      h.points as history
    from exercise x
    join history h on h.exercise_id = x.id
    left join v_prs p on p.exercise_id = x.id
    order by x.is_key desc, x.canonical_name
  `) as unknown as Array<{
    exercise_id: number; canonical_name: string; is_key: boolean; family: string | null;
    max_added_load: number | null; min_assist_load: number | null; max_metric: number | null;
    history: Array<{ date: string; load_type: string; load_value: number | null; metric_value: number; metric_type: string }>;
  }>;
}

// The ladder shows load only, so a stale reading looks identical to a current one.
// Pair it with the date it came from and how many upper sessions have passed since.
export async function muscleUpContext() {
  const [row] = await sql`
    with last_mu as (
      select max(s.date) as d
      from entry e
      join session s on s.id = e.session_id
      join exercise x on x.id = e.exercise_id
      where x.canonical_name = 'Muscle-up' and e.skipped = false
    )
    select
      (select d from last_mu) as last_date,
      (select count(*) from session s
        where s.region = 'U' and s.date > (select d from last_mu))::int as upper_since
  `;
  return row as unknown as { last_date: string | null; upper_since: number };
}

// Skipped entries are NOT filtered out here (unlike every PR/progression query):
// a skip is an adherence signal the generator should see when autoregulating, so
// it rides along flagged rather than vanishing. Same for recentSessions below.
export async function recentActuals(region: "U" | "L", limit = 4) {
  return (await sql`
    select s.date, s.region, s.type, s.rpe, s.feel, s.mu_note,
           json_agg(json_build_object(
             'exercise', x.canonical_name, 'metric', e.metric_value, 'metric_type', e.metric_type,
             'load_type', e.load_type, 'load_value', e.load_value,
             'sets', e.sets, 'skipped', e.skipped, 'notes', e.notes
           ) order by e.id) as entries
    from session s
    join entry e on e.session_id = s.id
    join exercise x on x.id = e.exercise_id
    where s.region = ${region}
    group by s.id
    order by s.date desc
    limit ${limit}
  `) as unknown as Array<Record<string, unknown>>;
}

// Feeds the dashboard calendar tile. Fetches a generous window (default 28d);
// the component does its own Monday-aligned 3-week grid and ignores rows
// outside it, so this just needs to cover that grid without exact alignment.
export async function recentCalendar(days = 28) {
  return (await sql`
    select date, region, type, rpe
    from session
    where date >= current_date - ${days}::int
    order by date asc
  `) as unknown as Array<{ date: string; region: string | null; type: string | null; rpe: number | null }>;
}

export interface HistoryPoint {
  date: string;
  metric_value: number;
  metric_type: string;
  load_type: string;
  load_value: number | null;
  sets: number | null;
  notes: string | null;
}

// Last N results for each of several lifts, newest first — the strip shown next
// to each input on /log. One round-trip for the whole session; never call this
// per exercise.
export async function recentPerExercise(names: string[], limit = 7) {
  if (!names.length) return [] as Array<{ canonical_name: string; points: HistoryPoint[] }>;
  return (await sql`
    with ranked as (
      select x.canonical_name, s.date, e.metric_value, e.metric_type,
             e.load_type, e.load_value, e.sets, e.notes,
             row_number() over (partition by e.exercise_id order by s.date desc, e.id desc) as rn
      from entry e
      join session s on s.id = e.session_id
      join exercise x on x.id = e.exercise_id
      where x.canonical_name = any(${names}) and e.skipped = false
    )
    select canonical_name,
           json_agg(json_build_object(
             'date', date, 'metric_value', metric_value, 'metric_type', metric_type,
             'load_type', load_type, 'load_value', load_value,
             'sets', sets, 'notes', notes
           ) order by date desc) as points
    from ranked
    where rn <= ${limit}
    group by canonical_name
  `) as unknown as Array<{ canonical_name: string; points: HistoryPoint[] }>;
}

export async function recentSessions(limit = 20) {
  return (await sql`
    select s.id, s.date, s.region, s.type, s.rpe, s.feel, s.mu_note,
           json_agg(json_build_object(
             'exercise', x.canonical_name, 'metric', e.metric_value,
             'load_type', e.load_type, 'load_value', e.load_value, 'unit', e.load_unit,
             'sets', e.sets, 'skipped', e.skipped
           ) order by e.id) as entries
    from session s
    join entry e on e.session_id = s.id
    join exercise x on x.id = e.exercise_id
    group by s.id
    order by s.date desc
    limit ${limit}
  `) as unknown as Array<Record<string, unknown>>;
}

// Best ever per roadmap metric, with the date it was set. All-time by design:
// a cleared gate stays cleared (see src/lib/roadmap.ts). Each branch takes the
// single best row rather than a bare max() so the date travels with the value.
export async function roadmapAchieved() {
  const rows = (await sql`
    with logged as (
      select x.canonical_name as name, e.load_type, e.load_value, e.metric_value, s.date
      from entry e
      join exercise x on x.id = e.exercise_id
      join session s on s.id = e.session_id
      where e.skipped = false
    )
    (select 'band' as key, load_value as value, date from logged
      where name = 'Muscle-up' and load_type = 'assisted' and load_value is not null
      order by load_value desc, date desc limit 1)
    union all
    (select 'negatives', metric_value, date from logged
      where name = 'Muscle-up negative'
      order by metric_value desc, date desc limit 1)
    union all
    -- Rep-qualified: the roadmap asks for +12-13kg *at 3-5 reps*, so a heavy
    -- single would not satisfy it and must not be read as if it did.
    (select 'pullup', load_value, date from logged
      where name = 'Pull-ups' and load_type in ('added','external')
        and load_value is not null and metric_value between 3 and 5
      order by load_value desc, date desc limit 1)
    union all
    (select 'ringdip', metric_value, date from logged
      where name = 'Ring dip'
      order by metric_value desc, date desc limit 1)
  `) as unknown as Array<{ key: MetricKey; value: string; date: string }>;

  const out: Achieved = { band: null, negatives: null, pullup: null, ringdip: null };
  for (const r of rows) {
    out[r.key] = { value: Number(r.value), date: String(r.date) };
  }
  return out;
}
