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
  // Pick a lift that has never been loaded, so "first-ever load is a PR" stays true
  // however far Julien's real numbers move. Hardcoding "Chin-ups @ 10kg" broke the
  // day he pulled 12.5.
  const [fresh] = await sql`
    select x.canonical_name from exercise x
    where not exists (
      select 1 from entry e
      where e.exercise_id = x.id and e.load_type in ('added','external')
    )
    order by x.id limit 1
  `;
  const name = fresh.canonical_name as string;
  const res = await logWorkout({
    date: "2099-01-01", region: "U", type: "Strength",
    entries: [{ exercise: name, metric: 5, load_type: "added", load_value: 2.5 }],
  });
  const r = res.results.find((x) => x.canonical_name === name)!;
  assert.equal(r.resolution, "exact");
  assert.equal(r.is_pr, true);
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

test("fuzzy match is NOT auto-written (needs confirmation)", async () => {
  // Build the near-miss from a real name (last character doubled, as a typo would)
  // so it stays fuzzy as the registry grows. "Ring muscle-up row" was hardcoded here
  // as a fuzzy miss and quietly became an exact match once it was added as a lift.
  const [ex] = await sql`
    select canonical_name from exercise where length(canonical_name) >= 12 order by id limit 1
  `;
  const real = ex.canonical_name as string;
  const typo = real + real.slice(-1);
  const res = await logWorkout({ date: "2099-01-01", region: "U",
    entries: [{ exercise: typo, metric: 5, load_type: "bodyweight" }] });
  const r = res.results.find((x) => x.input.exercise === typo)!;
  assert.equal(r.resolution, "needs_confirmation");
  assert.equal(r.written, false);
});
