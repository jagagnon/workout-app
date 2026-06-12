import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { sql } from "../src/db/client";
import { logWorkout } from "../src/lib/log-workout";
import { exerciseProgression, muscleUpLadder, stalledLifts } from "../src/lib/progress";

before(async () => {
  await logWorkout({ date: "2099-02-01", region: "U",
    entries: [{ exercise: "Muscle-up", metric: 3, load_type: "assisted", load_value: -30 }] });
  await logWorkout({ date: "2099-02-03", region: "U",
    entries: [{ exercise: "Muscle-up", metric: 3, load_type: "assisted", load_value: -25 }] });
});
after(async () => {
  await sql`delete from entry where session_id in (select id from session where date in ('2099-02-01','2099-02-03'))`;
  await sql`delete from session where date in ('2099-02-01','2099-02-03')`;
  await sql.end();
});

test("ladder returns assisted load over time, ascending toward zero", async () => {
  const ladder = await muscleUpLadder();
  const pts = ladder.filter((p) => new Date(p.date).toISOString().slice(0, 10) >= "2099-02-01");
  assert.ok(pts.length >= 2);
  assert.ok(Number(pts.at(-1)!.load_value) > Number(pts[0].load_value));
});

test("progression returns rows for an exercise", async () => {
  const rows = await exerciseProgression("Muscle-up");
  assert.ok(rows.length >= 2);
});

test("stalledLifts returns an array", async () => {
  const rows = await stalledLifts(3);
  assert.ok(Array.isArray(rows));
});
