import { test } from "node:test";
import assert from "node:assert/strict";
import { PR_BASELINE, type PrBaseline } from "../src/db/pr-baseline-data";
import { buildBaselinePlan } from "../src/db/baseline-plan";
import type { ExerciseRow } from "../src/lib/exercises";

test("baseline data: no two records collide on (date, exercise)", () => {
  const seen = new Set<string>();
  for (const r of PR_BASELINE) {
    const key = `${r.date}::${r.exercise}`;
    assert.ok(!seen.has(key), `duplicate (date,exercise): ${key}`);
    seen.add(key);
  }
});

test("baseline data: assisted loads are negative, added are positive", () => {
  for (const r of PR_BASELINE) {
    if (r.load_type === "assisted") assert.ok((r.load_value ?? 0) < 0, `${r.exercise} assisted must be negative`);
    if (r.load_type === "added") assert.ok((r.load_value ?? 0) > 0, `${r.exercise} added must be positive`);
    if (r.load_type === "bodyweight") assert.equal(r.load_value, null, `${r.exercise} bodyweight load must be null`);
  }
});

test("baseline data: 34 records imported", () => {
  assert.equal(PR_BASELINE.length, 34);
});

const REGISTRY: ExerciseRow[] = [
  { id: 2, canonical_name: "Muscle-up", aliases: ["muscle up", "mu"] },
  { id: 4, canonical_name: "Dips", aliases: ["dip"] },
];

const RECORDS: PrBaseline[] = [
  { exercise: "Muscle-up", date: "2026-03-28", load_type: "assisted", load_value: -25, metric_value: 1 },
  { exercise: "Dips", date: "2026-03-29", load_type: "added", load_value: 10, metric_value: 1 },
  { exercise: "Two-handed KB deadlift", date: "2026-03-29", load_type: "external", load_value: 32, metric_value: 1, aliases: ["kb deadlift"] },
];

test("planner: existing exercise resolves to its id, not flagged new", () => {
  const plan = buildBaselinePlan(RECORDS, REGISTRY);
  const mu = plan.entries.find((e) => e.exercise === "Muscle-up")!;
  assert.equal(mu.exercise_id, 2);
  assert.ok(!plan.newExercises.some((n) => n.canonical_name === "Muscle-up"));
});

test("planner: unknown exercise is flagged new with metadata", () => {
  const plan = buildBaselinePlan(RECORDS, REGISTRY);
  const nw = plan.newExercises.find((n) => n.canonical_name === "Two-handed KB deadlift")!;
  assert.ok(nw);
  assert.equal(nw.default_load_type, "external");
  assert.equal(nw.primary_metric, "reps");
  assert.deepEqual(nw.aliases, ["kb deadlift"]);
});

test("planner: distinct dates become sessions; same date shares one", () => {
  const plan = buildBaselinePlan(RECORDS, REGISTRY);
  assert.deepEqual([...plan.dates].sort(), ["2026-03-28", "2026-03-29"]);
});
