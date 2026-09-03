import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePlanBody } from "../src/lib/plan-body";

// Every body below is a verbatim plan the generator actually wrote.
const UPPER = `W: High pull-ups, Straight-arm pulldown, Top quarter pull drills, Ring dip, Inverted rows, Parallette push-ups, Front lever tuck hold, Kneeling pallof press
A1: High pull-ups 3×1-2-3-4-5
B1: Top quarter pull drills 3-4×6-8 | B2: Ring dip 4×4-6
C1: Inverted rows 3×15 | C2: Parallette push-ups 3×12-15
F: Front lever tuck hold 3×6-10s, Kneeling pallof press 3×10-12s/side`;

const LOWER = `W: Bird dog, Cossack squat
A1: Pogo Jumps 3x10
B1: Step throughs 3x12/side bodyweight
C1: Banded hip extension 5kg 3x12/side (L emphasis)
D1: Goblet squat 22.5kg 3x8-10`;

test("the warm-up line is not a logged slot", () => {
  assert.equal(parsePlanBody(UPPER).filter((i) => i.block === "W").length, 0);
});

test("supersets on one line split into their own slots, labels intact", () => {
  const items = parsePlanBody(UPPER);
  assert.deepEqual(items.map((i) => i.label), ["A1", "B1", "B2", "C1", "C2", "F1", "F2"]);
  assert.equal(items[1].exercise, "Top quarter pull drills");
  assert.equal(items[2].exercise, "Ring dip");
});

test("a sets range takes its top, and reps stay a string", () => {
  const b1 = parsePlanBody(UPPER).find((i) => i.label === "B1")!;
  assert.equal(b1.sets, 4);          // "3-4×6-8"
  assert.equal(b1.reps, "6-8");
});

test("an unnumbered F line splits on commas into F1, F2", () => {
  const f = parsePlanBody(UPPER).filter((i) => i.block === "F");
  assert.equal(f.length, 2);
  assert.equal(f[0].exercise, "Front lever tuck hold");
  assert.equal(f[1].exercise, "Kneeling pallof press");
});

test("a seconds suffix sets the metric, and /side is not part of the name", () => {
  const f2 = parsePlanBody(UPPER).find((i) => i.label === "F2")!;
  assert.equal(f2.metric_type, "seconds");
  assert.equal(f2.reps, "10-12");
  // "10-12s/side" is reps per leg. per_side qualifies the *load*, so it stays false.
  assert.equal(f2.per_side, false);
  assert.equal(f2.exercise, "Kneeling pallof press");
});

test("per_side is set only when /side attaches to a weight", () => {
  const two = parsePlanBody("A1: Front foot elevated split squat 10kg/side 3x8")[0];
  assert.equal(two.per_side, true, "a bell in each hand");
  assert.equal(two.load_value, 10);

  const one = parsePlanBody("A1: Bulgarian split squat 16kg 3x8/side")[0];
  assert.equal(one.per_side, false, "reps per leg says nothing about the load");
  assert.equal(one.load_value, 16);
  assert.equal(one.exercise, "Bulgarian split squat");
});

test("Lower days: inline kg becomes a load, not part of the name", () => {
  const items = parsePlanBody(LOWER);
  const banded = items.find((i) => i.label === "C1")!;
  assert.equal(banded.exercise, "Banded hip extension");
  assert.equal(banded.load_value, 5);
  assert.equal(banded.load_type, "external");
  assert.equal(banded.cue, "L emphasis");

  const goblet = items.find((i) => i.label === "D1")!;
  assert.equal(goblet.exercise, "Goblet squat");
  assert.equal(goblet.load_value, 22.5);
});

test("an explicit 'bodyweight' wins over any load seeding", () => {
  const step = parsePlanBody(LOWER).find((i) => i.label === "B1")!;
  assert.equal(step.exercise, "Step throughs");
  assert.equal(step.load_type, "bodyweight");
  assert.equal(step.per_side, false);
});

test("both × and x separate sets from reps", () => {
  assert.equal(parsePlanBody("A1: Pogo Jumps 3x10")[0].reps, "10");
  assert.equal(parsePlanBody("A1: Pogo Jumps 3×10")[0].reps, "10");
});

test("a name with a parenthetical keeps it; a trailing note becomes the cue", () => {
  const [i] = parsePlanBody("A1: Weighted pull-ups (pronated) 4×3-5");
  assert.equal(i.exercise, "Weighted pull-ups (pronated)");
  assert.equal(i.cue, null);
});

test("a line with no spec still yields the lift", () => {
  const [i] = parsePlanBody("A1: Muscle-up");
  assert.equal(i.exercise, "Muscle-up");
  assert.equal(i.sets, null);
  assert.equal(i.reps, null);
});

test("empty and malformed bodies yield nothing rather than throwing", () => {
  assert.deepEqual(parsePlanBody(""), []);
  assert.deepEqual(parsePlanBody(null), []);
  assert.deepEqual(parsePlanBody("just some prose"), []);
});
