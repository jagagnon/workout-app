import { test } from "node:test";
import assert from "node:assert/strict";
import { matchExercise, type ExerciseRow } from "../src/lib/exercises";

const REGISTRY: ExerciseRow[] = [
  { id: 1, canonical_name: "Chin-ups", aliases: ["chins", "weighted chin-ups"] },
  { id: 2, canonical_name: "Muscle-up", aliases: ["muscle up", "mu"] },
  { id: 3, canonical_name: "Dips", aliases: ["dip"] },
];

test("exact canonical match", () => {
  const r = matchExercise("Chin-ups", REGISTRY);
  assert.equal(r.exercise_id, 1);
  assert.equal(r.resolution, "exact");
});
test("alias match is case-insensitive", () => {
  const r = matchExercise("CHINS", REGISTRY);
  assert.equal(r.exercise_id, 1);
  assert.equal(r.resolution, "alias");
});
test("close fuzzy match resolves but flags fuzzy", () => {
  const r = matchExercise("chin up", REGISTRY);
  assert.equal(r.exercise_id, 1);
  assert.equal(r.resolution, "fuzzy");
});
test("no confident match → needs_confirmation with candidates", () => {
  const r = matchExercise("zercher squat", REGISTRY);
  assert.equal(r.exercise_id, null);
  assert.equal(r.resolution, "needs_confirmation");
  assert.ok(Array.isArray(r.candidates));
});
