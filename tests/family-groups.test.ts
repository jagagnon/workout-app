import { test } from "node:test";
import assert from "node:assert/strict";
import { clusterByFamily } from "../src/lib/family-groups";

test("clusters same-family rows together and headers only the first", () => {
  const rows = [
    { canonical_name: "Seated machine row", family: "Row" },
    { canonical_name: "Dips", family: null },
    { canonical_name: "Inverted rows", family: "Row" },
    { canonical_name: "Push-ups", family: "Push-up" },
  ];
  const clustered = clusterByFamily(rows);
  assert.deepEqual(
    clustered.map((c) => c.item.canonical_name),
    ["Dips", "Push-ups", "Inverted rows", "Seated machine row"],
  );
  assert.deepEqual(
    clustered.map((c) => c.familyHeader),
    [null, null, "Row", null],
  );
});

test("a family with a single member gets no header", () => {
  const rows = [
    { canonical_name: "Solo lift", family: "Solo" },
    { canonical_name: "Dips", family: null },
  ];
  const clustered = clusterByFamily(rows);
  assert.deepEqual(clustered.map((c) => c.familyHeader), [null, null]);
});

test("within a family, the key lift leads the cluster", () => {
  const rows = [
    { canonical_name: "Parallette push-ups", family: "Push-up", is_key: false },
    { canonical_name: "Push-ups", family: "Push-up", is_key: true },
    { canonical_name: "Scapular push-up", family: "Push-up", is_key: false },
  ];
  const clustered = clusterByFamily(rows);
  assert.deepEqual(
    clustered.map((c) => c.item.canonical_name),
    ["Push-ups", "Parallette push-ups", "Scapular push-up"],
  );
});

test("ungrouped exercises keep their own alphabetical slot", () => {
  const rows = [
    { canonical_name: "Zercher squat", family: null },
    { canonical_name: "Ab wheel", family: null },
  ];
  const clustered = clusterByFamily(rows);
  assert.deepEqual(
    clustered.map((c) => c.item.canonical_name),
    ["Ab wheel", "Zercher squat"],
  );
});
