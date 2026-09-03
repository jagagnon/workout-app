import { test } from "node:test";
import assert from "node:assert/strict";
import { formatLoad } from "../src/lib/load";

// The sign is always shown, and does not depend on added vs external —
// nothing downstream distinguishes those two.
test("added load shows +kg", () => {
  assert.equal(formatLoad("added", 10, "kg"), "+10kg");
});
test("assisted load shows -kg", () => {
  assert.equal(formatLoad("assisted", -25, "kg"), "-25kg");
});
test("external load shows the same +kg as added", () => {
  assert.equal(formatLoad("external", 16, "kg"), "+16kg");
});
test("bodyweight shows BW", () => {
  assert.equal(formatLoad("bodyweight", null, "kg"), "BW");
});
// A load is the total lifted; how many hands carry it is not encoded in the number.
test("a two-handed load is shown as its total, with no qualifier", () => {
  assert.equal(formatLoad("external", 20, "kg"), "+20kg");
});
