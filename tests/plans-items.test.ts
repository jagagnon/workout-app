import { test, after } from "node:test";
import assert from "node:assert/strict";
import { sql } from "../src/db/client";
import { logPlan, planForDate } from "../src/lib/plans";

const DATE = "2099-05-01";

after(async () => {
  await sql`delete from plan where date = ${DATE}`;
  await sql.end();
});

test("logPlan round-trips items", async () => {
  const items = [
    { block: "A", label: "A1", exercise: "Pull-ups", sets: 4, reps: "6-8",
      tempo: "3-0-1-1", load_type: "added" as const, load_value: 5 },
  ];
  const row = await logPlan({ date: DATE, region: "U", stimulus: "Strength", body: "A1: Pull-ups 4x6-8", items });
  assert.equal(row.items?.length, 1);
  assert.equal(row.items?.[0].tempo, "3-0-1-1");

  const back = await planForDate(DATE, "U");
  assert.equal(back?.items?.[0].exercise, "Pull-ups");
  assert.equal(back?.body, "A1: Pull-ups 4x6-8");
});

test("a body-only re-write keeps existing items (back-compat with the old skill)", async () => {
  const row = await logPlan({ date: DATE, region: "U", body: "A1: Pull-ups 4x6-8 (edited)" });
  assert.equal(row.body, "A1: Pull-ups 4x6-8 (edited)");
  assert.equal(row.items?.length, 1, "items were blanked by a body-only write");
});

test("a plan with no items at all reads back fine", async () => {
  const row = await logPlan({ date: DATE, region: "L", body: "A1: Squats 3x5" });
  assert.equal(row.items, null);
  assert.equal((await planForDate(DATE, "L"))?.items, null);
});
