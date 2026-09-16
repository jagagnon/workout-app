import { test } from "node:test";
import assert from "node:assert/strict";
import { checkExerciseConflict, matchExercise, type ExerciseRow } from "../src/lib/exercises";

const REGISTRY: ExerciseRow[] = [
  { id: 1, canonical_name: "Chin-ups", aliases: ["chins", "weighted chin-ups"] },
  { id: 2, canonical_name: "Muscle-up", aliases: ["muscle up", "mu"] },
  { id: 3, canonical_name: "Dips", aliases: ["dip"] },
  { id: 4, canonical_name: "Pull-ups", aliases: ["pull up", "pullup", "weighted pull-ups"] },
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
test("a weighted variant of a bodyweight lift matches via alias, not needs_confirmation", () => {
  // "weighted pull ups" is too far from "Pull-ups" by fuzzy distance alone (the
  // "weighted" prefix pushed it past the 0.25 threshold) — it needs the explicit
  // alias, same as "weighted chin-ups" already has for Chin-ups.
  const r = matchExercise("weighted pull ups", REGISTRY);
  assert.equal(r.exercise_id, 4);
  assert.equal(r.resolution, "alias");
});

test("conflict: exact canonical name is a collision", () => {
  const r = checkExerciseConflict("dips", REGISTRY);
  assert.equal(r.kind, "collision");
  assert.equal(r.kind === "collision" && r.existing, "Dips");
});
test("conflict: exact alias is a collision", () => {
  const r = checkExerciseConflict("Pull up", REGISTRY);
  assert.equal(r.kind, "collision");
  assert.equal(r.kind === "collision" && r.existing, "Pull-ups");
});
test("conflict: shared word token warns but allows", () => {
  const r = checkExerciseConflict("Paused dips", REGISTRY);
  assert.equal(r.kind, "warn");
  assert.equal(r.kind === "warn" && r.similar, "Dips");
});
test("conflict: genuinely new exercise is ok", () => {
  const r = checkExerciseConflict("Zercher squat", REGISTRY);
  assert.equal(r.kind, "ok");
});
