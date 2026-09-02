import { test } from "node:test";
import assert from "node:assert/strict";
import { autoregulate, parseRange } from "../src/lib/autoregulate";

test("parseRange handles ranges, singles and junk", () => {
  assert.deepEqual(parseRange("6-8"), [6, 8]);
  assert.deepEqual(parseRange("8"), [8, 8]);
  assert.equal(parseRange("AMRAP"), null);
  assert.equal(parseRange(null), null);
});

const cases: Array<[string, Parameters<typeof autoregulate>[0], string]> = [
  ["top of range, RPE 7 -> progress",
    { reps_prescribed: "6-8", reps_done: 8, rpe: 7, load_type: "added", load_value: 10 }, "progress"],
  // The boundary the rule turns on: same reps, one RPE point up, is a hold.
  ["top of range, RPE 8 -> hold",
    { reps_prescribed: "6-8", reps_done: 8, rpe: 8, load_type: "added", load_value: 10 }, "hold"],
  ["mid range, RPE 8 -> hold",
    { reps_prescribed: "6-8", reps_done: 7, rpe: 8, load_type: "added", load_value: 10 }, "hold"],
  ["mid range, RPE 6 -> progress on reps",
    { reps_prescribed: "6-8", reps_done: 7, rpe: 6, load_type: "added", load_value: 10 }, "progress"],
  ["missed range -> deload",
    { reps_prescribed: "6-8", reps_done: 4, rpe: 8, load_type: "added", load_value: 10 }, "deload"],
  ["RPE 10 at top of range -> deload",
    { reps_prescribed: "6-8", reps_done: 8, rpe: 10, load_type: "added", load_value: 10 }, "deload"],
  ["niggle flagged -> deload",
    { reps_prescribed: "6-8", reps_done: 8, rpe: 6, niggle: true }, "deload"],
  ["no prescribed range, RPE 6 -> progress",
    { reps_prescribed: null, reps_done: 12, rpe: 6 }, "progress"],
];

for (const [name, input, expected] of cases) {
  test(`autoregulate: ${name}`, () => {
    assert.equal(autoregulate(input).call, expected);
  });
}

test("progress on a loaded lift suggests the next step", () => {
  const r = autoregulate({ reps_prescribed: "6-8", reps_done: 8, rpe: 7, load_type: "added", load_value: 10 });
  assert.match(r.note, /12\.5kg/);
});

test("assisted progress moves toward zero assistance", () => {
  // Assist is stored negative, so less assistance is a larger number.
  const r = autoregulate({ reps_prescribed: "3-5", reps_done: 5, rpe: 7, load_type: "assisted", load_value: -25 });
  assert.equal(r.call, "progress");
  assert.match(r.note, /-22\.5kg/);
});
