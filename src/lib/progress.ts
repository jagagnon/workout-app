import { sql } from "../db/client";

export async function exerciseProgression(canonicalName: string) {
  return (await sql`
    select s.date, s.type as stimulus, e.metric_value, e.metric_type, e.load_type, e.load_value, e.load_unit, e.per_side
    from entry e
    join session s on s.id = e.session_id
    join exercise x on x.id = e.exercise_id
    where x.canonical_name = ${canonicalName}
    order by s.date asc
  `) as unknown as Array<{ date: string; stimulus: string | null; metric_value: number; load_value: number | null }>;
}

export async function muscleUpLadder() {
  return (await sql`
    select s.date, e.load_value, e.load_type, e.metric_value
    from entry e
    join session s on s.id = e.session_id
    join exercise x on x.id = e.exercise_id
    where x.canonical_name = 'Muscle-up'
    order by s.date asc
  `) as unknown as Array<{ date: string; load_value: number | null; load_type: string }>;
}

export async function stalledLifts(n = 3) {
  return (await sql`
    with ranked as (
      select x.canonical_name, s.date, e.load_value, e.load_type,
             row_number() over (partition by e.exercise_id order by s.date desc) as rn
      from entry e
      join session s on s.id = e.session_id
      join exercise x on x.id = e.exercise_id
      where e.load_type in ('added','external')
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

export async function prBoard(includeAll = false) {
  // Default: key lifts only (the visual board). includeAll drops the filter so the
  // generator can autoregulate off every tracked lift; un-logged ones come back null.
  return (await sql`
    select e.id as exercise_id, e.canonical_name,
           p.max_added_load, p.min_assist_load, p.max_metric
    from exercise e
    left join v_prs p on p.exercise_id = e.id
    ${includeAll ? sql`` : sql`where e.is_key`}
    order by e.canonical_name
  `) as unknown as Array<Record<string, unknown>>;
}

export async function allExercisePrs() {
  return (await sql`
    with first_entry as (
      select distinct on (e.exercise_id)
        e.exercise_id, e.load_type, e.load_value, e.metric_value
      from entry e
      join session s on s.id = e.session_id
      order by e.exercise_id, s.date asc, e.id asc
    ),
    history as (
      select e.exercise_id,
             json_agg(json_build_object(
               'date', s.date, 'load_value', e.load_value, 'metric_value', e.metric_value
             ) order by s.date asc, e.id asc) as points
      from entry e
      join session s on s.id = e.session_id
      group by e.exercise_id
    )
    select
      x.id as exercise_id, x.canonical_name,
      f.load_type as start_load_type, f.load_value as start_load_value, f.metric_value as start_metric,
      p.max_added_load, p.min_assist_load, p.max_metric,
      h.points as history
    from exercise x
    join first_entry f on f.exercise_id = x.id
    join history h on h.exercise_id = x.id
    left join v_prs p on p.exercise_id = x.id
    order by x.canonical_name
  `) as unknown as Array<{
    exercise_id: number; canonical_name: string;
    start_load_type: string; start_load_value: number | null; start_metric: number;
    max_added_load: number | null; min_assist_load: number | null; max_metric: number | null;
    history: Array<{ date: string; load_value: number | null; metric_value: number }>;
  }>;
}

export async function recentActuals(region: "U" | "L", limit = 4) {
  return (await sql`
    select s.date, s.region, s.type, s.rpe, s.feel, s.mu_note,
           json_agg(json_build_object(
             'exercise', x.canonical_name, 'metric', e.metric_value, 'metric_type', e.metric_type,
             'load_type', e.load_type, 'load_value', e.load_value, 'per_side', e.per_side
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

export async function recentSessions(limit = 20) {
  return (await sql`
    select s.id, s.date, s.region, s.type, s.rpe, s.feel, s.mu_note,
           json_agg(json_build_object(
             'exercise', x.canonical_name, 'metric', e.metric_value,
             'load_type', e.load_type, 'load_value', e.load_value, 'unit', e.load_unit
           ) order by e.id) as entries
    from session s
    join entry e on e.session_id = s.id
    join exercise x on x.id = e.exercise_id
    group by s.id
    order by s.date desc
    limit ${limit}
  `) as unknown as Array<Record<string, unknown>>;
}
