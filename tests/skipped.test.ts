import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { sql } from "../src/db/client";
import { logWorkout } from "../src/lib/log-workout";
import { allExercisePrs, exerciseProgression, recentPerExercise } from "../src/lib/progress";

const DATE = "2099-07-01";
let lift: string;

async function cleanup() {
  await sql`delete from entry where session_id in (select id from session where date = ${DATE})`;
  await sql`delete from session where date = ${DATE}`;
}

before(async () => {
  await cleanup();
  // A lift that has never been loaded, so an absurd skipped "PR" would be
  // unmistakable if the exclusion leaked. (Same trick as log-workout.test.ts.)
  const [fresh] = await sql`
    select x.canonical_name from exercise x
    where not exists (
      select 1 from entry e where e.exercise_id = x.id and e.load_type in ('added','external')
    )
    order by x.id limit 1
  `;
  lift = fresh.canonical_name as string;
});
after(async () => { await cleanup(); await sql.end(); });

test("a skipped entry is written but never a PR", async () => {
  const res = await logWorkout({
    date: DATE, region: "U",
    entries: [{ exercise: lift, metric: 999, load_type: "added", load_value: 999, sets: 0, skipped: true }],
  });
  const r = res.results.find((x) => x.canonical_name === lift)!;
  assert.equal(r.written, true);
  assert.equal(r.is_pr, false);

  const [row] = await sql`
    select e.skipped, e.sets from entry e
    join session s on s.id = e.session_id
    where s.date = ${DATE} and e.exercise_id = (select id from exercise where canonical_name = ${lift})
  `;
  assert.equal(row.skipped, true);
  assert.equal(Number(row.sets), 0);
});

test("skipped rows are invisible to progression, the PR board and history", async () => {
  const prog = await exerciseProgression(lift);
  assert.equal(prog.filter((p) => Number(p.metric_value) === 999).length, 0);

  const prs = await allExercisePrs();
  const board = prs.find((p) => p.canonical_name === lift);
  assert.ok(board == null || Number(board.max_added_load ?? 0) !== 999,
    "skipped load reached the PR board");

  const hist = await recentPerExercise([lift]);
  const pts = hist.find((h) => h.canonical_name === lift)?.points ?? [];
  assert.equal(pts.filter((p) => Number(p.metric_value) === 999).length, 0);
});

test("v_prs excludes skipped rows", async () => {
  const [row] = await sql`
    select max_added_load from v_prs
    where exercise_id = (select id from exercise where canonical_name = ${lift})
  `;
  assert.ok(row == null || Number(row.max_added_load ?? 0) !== 999);
});

test("recentPerExercise returns at most `limit` points, newest first", async () => {
  const hist = await recentPerExercise(["Chin-ups", "Dips"], 3);
  for (const h of hist) {
    assert.ok(h.points.length <= 3);
    const dates = h.points.map((p) => String(p.date));
    assert.deepEqual(dates, [...dates].sort().reverse());
  }
});

test("recentPerExercise with no names does not hit the DB", async () => {
  assert.deepEqual(await recentPerExercise([]), []);
});
