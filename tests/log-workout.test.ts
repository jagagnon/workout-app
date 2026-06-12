import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { sql } from "../src/db/client";
import { logWorkout } from "../src/lib/log-workout";

before(async () => {
  await sql`delete from entry where session_id in (select id from session where date = '2099-01-01')`;
  await sql`delete from session where date = '2099-01-01'`;
});
after(async () => {
  await sql`delete from entry where session_id in (select id from session where date = '2099-01-01')`;
  await sql`delete from session where date = '2099-01-01'`;
  await sql.end();
});

test("logs a session and returns PR for first-ever load", async () => {
  const res = await logWorkout({
    date: "2099-01-01", region: "U", type: "Strength",
    entries: [{ exercise: "Chin-ups", metric: 5, load_type: "added", load_value: 10 }],
  });
  const chin = res.results.find((r) => r.canonical_name === "Chin-ups")!;
  assert.equal(chin.resolution, "exact");
  assert.equal(chin.is_pr, true);
});

test("re-logging same exercise same day overwrites (idempotent)", async () => {
  await logWorkout({ date: "2099-01-01", region: "U",
    entries: [{ exercise: "Chin-ups", metric: 6, load_type: "added", load_value: 10 }] });
  const rows = await sql`
    select e.metric_value from entry e
    join session s on s.id = e.session_id
    where s.date = '2099-01-01' and e.exercise_id = (select id from exercise where canonical_name='Chin-ups')`;
  assert.equal(rows.length, 1);
  assert.equal(Number(rows[0].metric_value), 6);
});

test("unmatched exercise returns needs_confirmation and is NOT written", async () => {
  const res = await logWorkout({ date: "2099-01-01", region: "U",
    entries: [{ exercise: "zercher squat", metric: 8, load_type: "external", load_value: 40 }] });
  const z = res.results.find((r) => r.input.exercise === "zercher squat")!;
  assert.equal(z.resolution, "needs_confirmation");
  assert.equal(z.written, false);
});
