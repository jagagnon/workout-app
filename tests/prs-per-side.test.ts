import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { sql } from "../src/db/client";

// Far-future dates so nothing collides with real data. Two dates because entry
// is unique on (session_id, exercise_id) — the same lift twice needs two sessions.
const D1 = "2099-11-11";
const D2 = "2099-11-12";
let lift: string;
let liftId: number;

async function cleanup() {
  await sql`delete from entry where session_id in (select id from session where date in (${D1}, ${D2}))`;
  await sql`delete from session where date in (${D1}, ${D2})`;
}

before(async () => {
  await cleanup();
  // An exercise nobody has ever loaded, so these two rows are the only candidates.
  const [fresh] = await sql`
    select x.id, x.canonical_name from exercise x
    where not exists (
      select 1 from entry e where e.exercise_id = x.id and e.load_type in ('added','external')
    )
    order by x.id limit 1
  `;
  liftId = fresh.id as number;
  lift = fresh.canonical_name as string;

  for (const [d, load, perSide] of [[D1, 10, true], [D2, 15, false]] as const) {
    const [s] = await sql`insert into session (date, region) values (${d}, 'L') returning id`;
    await sql`
      insert into entry (session_id, exercise_id, metric_type, metric_value,
                         load_type, load_value, per_side)
      values (${s.id}, ${liftId}, 'reps', 8, 'external', ${load}, ${perSide})
    `;
  }
});
after(async () => { await cleanup(); await sql.end(); });

test("v_prs counts a per_side load as both implements", async () => {
  const [row] = await sql`select max_added_load from v_prs where exercise_id = ${liftId}`;
  // 10kg in each hand is 20kg of work, so it must beat a single 15kg implement.
  assert.equal(Number(row.max_added_load), 20,
    `${lift}: 10kg/side should rank as 20kg, not ${row?.max_added_load}`);
});

test("a single-implement load is left alone", async () => {
  await sql`update entry set per_side = false where exercise_id = ${liftId}
            and session_id in (select id from session where date = ${D1})`;
  const [row] = await sql`select max_added_load from v_prs where exercise_id = ${liftId}`;
  // With nothing flagged, the heaviest single implement wins on its face value.
  assert.equal(Number(row.max_added_load), 15);
});
