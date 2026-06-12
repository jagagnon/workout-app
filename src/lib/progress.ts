import { sql } from "../db/client";

export async function exerciseProgression(canonicalName: string) {
  return (await sql`
    select s.date, e.metric_value, e.metric_type, e.load_type, e.load_value, e.load_unit, e.per_side
    from entry e
    join session s on s.id = e.session_id
    join exercise x on x.id = e.exercise_id
    where x.canonical_name = ${canonicalName}
    order by s.date asc
  `) as unknown as Array<{ date: string; metric_value: number; load_value: number | null }>;
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

export async function prBoard() {
  return (await sql`select * from v_prs order by canonical_name`) as unknown as Array<Record<string, unknown>>;
}

export async function recentSessions(limit = 20) {
  return (await sql`
    select s.id, s.date, s.region, s.type,
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
