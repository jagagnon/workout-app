// src/db/migrate-prs.ts
import { sql } from "./client";
import { type ExerciseRow } from "../lib/exercises";
import { PR_BASELINE } from "./pr-baseline-data";
import { buildBaselinePlan } from "./baseline-plan";

async function main() {
  const registry = (await sql`select id, canonical_name, aliases from exercise`) as unknown as ExerciseRow[];
  const plan = buildBaselinePlan(PR_BASELINE, registry);

  // 1. Create new exercises, collecting their ids into a name->id map.
  const idByName = new Map<string, number>();
  for (const e of registry) idByName.set(e.canonical_name, e.id);
  for (const ne of plan.newExercises) {
    const [row] = await sql`
      insert into exercise (canonical_name, aliases, primary_metric, default_load_type, is_key)
      values (${ne.canonical_name}, ${ne.aliases}, ${ne.primary_metric}, ${ne.default_load_type}, false)
      on conflict (canonical_name) do update set aliases = excluded.aliases
      returning id
    `;
    idByName.set(ne.canonical_name, row.id as number);
  }
  console.log(`new exercises created/ensured: ${plan.newExercises.length}`);

  // 2. Baseline session per date (idempotent: look up by date + marker note).
  const NOTE = "PR baseline import";
  const sessionByDate = new Map<string, number>();
  for (const date of plan.dates) {
    const [existing] = await sql`select id from session where date = ${date} and notes = ${NOTE} limit 1`;
    if (existing) { sessionByDate.set(date, existing.id as number); continue; }
    const [row] = await sql`
      insert into session (date, region, type, notes) values (${date}, null, null, ${NOTE}) returning id
    `;
    sessionByDate.set(date, row.id as number);
  }
  console.log(`baseline sessions: ${sessionByDate.size}`);

  // 3. Upsert entries (idempotent via unique(session_id, exercise_id)).
  let n = 0;
  for (const e of plan.entries) {
    const exercise_id = e.exercise_id ?? idByName.get(e.exercise)!;
    const session_id = sessionByDate.get(e.date)!;
    await sql`
      insert into entry (session_id, exercise_id, metric_type, metric_value, load_type, load_value, load_unit, per_side, notes)
      values (${session_id}, ${exercise_id}, ${e.metric_type}, ${e.metric_value}, ${e.load_type}, ${e.load_value}, 'kg', ${e.per_side}, ${NOTE})
      on conflict (session_id, exercise_id) do update set
        metric_type = excluded.metric_type, metric_value = excluded.metric_value,
        load_type = excluded.load_type, load_value = excluded.load_value, per_side = excluded.per_side
    `;
    n++;
  }
  console.log(`baseline entries upserted: ${n}`);
  await sql.end();
}
main();
