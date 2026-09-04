import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { sql } from "../src/db/client";
import { logWorkout } from "../src/lib/log-workout";
import { prBoard } from "../src/lib/progress";

// Dates are this file's alone: test files run in parallel processes against the
// live DB, so a shared date would collide on `unique (date, region)`.
const RECENT_BW = "2099-08-01";
const RECENT_LOADED = "2099-08-03";
const OLD = "2019-01-05"; // deliberately outside the 90-day best-set window
const DATES = [RECENT_BW, RECENT_LOADED, OLD];

before(async () => {
  // More reps, no load — the set the old max(metric_value) would have picked.
  await logWorkout({ date: RECENT_BW, region: "U",
    entries: [{ exercise: "Push-ups", metric: 30, load_type: "bodyweight" }] });
  // Fewer reps, heaviest recent load — the set that should win.
  await logWorkout({ date: RECENT_LOADED, region: "U",
    entries: [{ exercise: "Push-ups", metric: 4, load_type: "added", load_value: 20 }] });
  // Heavier still, but long past: a PR for the load column, invisible to Best set.
  await logWorkout({ date: OLD, region: "U",
    entries: [{ exercise: "Push-ups", metric: 9, load_type: "added", load_value: 40 }] });
});

after(async () => {
  await sql`delete from entry where session_id in (select id from session where date in ${sql(DATES)})`;
  await sql`delete from session where date in ${sql(DATES)}`;
  await sql.end();
});

async function pushUps() {
  const row = (await prBoard(true)).find((r) => r.canonical_name === "Push-ups");
  assert.ok(row, "Push-ups should be on the board");
  return row;
}

test("best set is the most reps at the heaviest recent load, not the most reps", async () => {
  const row = await pushUps();
  assert.equal(Number(row.best_metric), 4);
  assert.equal(Number(row.best_load), 20);
  assert.equal(row.best_load_type, "added");
});

test("a set outside the window sets the load PR but never the best set", async () => {
  const row = await pushUps();
  // The load column is all-time, so the long-past 40kg still holds the PR...
  assert.equal(Number(row.max_added_load), 40);
  // ...while the best set ignores it, and reports neither its load nor its reps.
  assert.notEqual(Number(row.best_load), 40);
  assert.notEqual(Number(row.best_metric), 9);
});
