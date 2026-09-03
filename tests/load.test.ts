import { test } from "node:test";
import assert from "node:assert/strict";
import { formatLoad } from "../src/lib/load";

// Positive is load, negative is assistance — `added` and `external` render the
// same, because nothing downstream distinguishes them.
test("added load shows bare kg", () => {
  assert.equal(formatLoad("added", 10, "kg", false), "10kg");
});
test("assisted load shows -kg", () => {
  assert.equal(formatLoad("assisted", -25, "kg", false), "-25kg");
});
test("external load shows bare kg", () => {
  assert.equal(formatLoad("external", 16, "kg", false), "16kg");
});
test("bodyweight shows BW", () => {
  assert.equal(formatLoad("bodyweight", null, "kg", false), "BW");
});
test("per_side appends /side", () => {
  assert.equal(formatLoad("external", 12, "kg", true), "12kg/side");
});
