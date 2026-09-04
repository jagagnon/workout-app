import { test } from "node:test";
import assert from "node:assert/strict";
import { CHECKPOINTS, METRICS, metricStatus, roadmapStatus, type Achieved } from "../src/lib/roadmap";

const band = METRICS.find((m) => m.key === "band")!;
const negatives = METRICS.find((m) => m.key === "negatives")!;
const ringdip = METRICS.find((m) => m.key === "ringdip")!;

test("assistance compares the right way round: less assist clears the gate", () => {
  // Sep 30 wants -10kg. -20kg is MORE assistance, so it must not clear.
  const behind = metricStatus(band, { value: -20, date: "2026-08-20" }, "2026-09-04");
  assert.equal(behind.onTrack, false);
  assert.equal(behind.currentTarget, -10);
  assert.equal(behind.shortBy, 10);

  const met = metricStatus(band, { value: -5, date: "2026-09-04" }, "2026-09-04");
  assert.equal(met.onTrack, true);
  assert.equal(met.shortBy, null);
});

test("a range target is cleared at its floor", () => {
  // Sep 30 negatives read "6-8"; 6 is enough, 5 is not.
  assert.equal(metricStatus(negatives, { value: 6, date: "2026-08-22" }, "2026-09-04").onTrack, true);
  assert.equal(metricStatus(negatives, { value: 5, date: "2026-08-22" }, "2026-09-04").onTrack, false);
});

test("pips fill forward and only forward", () => {
  // 8 negatives clears Aug (3) and Sep (6) and Oct (8); Nov is ungated.
  const s = metricStatus(negatives, { value: 8, date: "2026-08-22" }, "2026-09-04");
  assert.deepEqual(s.cleared, [true, true, true, true]);

  const early = metricStatus(negatives, { value: 3, date: "2026-08-01" }, "2026-09-04");
  assert.deepEqual(early.cleared, [true, false, false, true]);
});

test("an ungated checkpoint is never reported as a miss", () => {
  // Ring dip is "maintain" at Nov 30 — no threshold to fall short of.
  const s = metricStatus(ringdip, { value: 6, date: "2026-09-02" }, "2026-11-15");
  assert.equal(s.current?.label, "Nov 30");
  assert.equal(s.currentTarget, null);
  assert.equal(s.onTrack, null);
  assert.equal(s.cleared.at(-1), true);
});

test("a lift that was never logged is behind, not absent", () => {
  const s = metricStatus(ringdip, null, "2026-09-04");
  assert.equal(s.achieved, null);
  assert.equal(s.onTrack, false);
  assert.equal(s.shortBy, null); // nothing to subtract from
  assert.deepEqual(s.cleared, [false, false, false, true]);
});

test("the current checkpoint is the first one not yet past", () => {
  const on = (d: string) => metricStatus(negatives, { value: 0, date: d }, d).current?.label;
  assert.equal(on("2026-08-15"), "Aug 31");
  assert.equal(on("2026-08-31"), "Aug 31"); // the day itself still counts
  assert.equal(on("2026-09-01"), "Sep 30");
  assert.equal(on("2026-12-15"), undefined); // past the last checkpoint
});

test("every checkpoint names every metric, so no cell renders blank", () => {
  for (const c of CHECKPOINTS) {
    for (const m of METRICS) {
      assert.ok(m.key in c.targets, `${c.label} missing target for ${m.key}`);
      assert.ok(c.display[m.key], `${c.label} missing display for ${m.key}`);
    }
  }
});

test("roadmapStatus covers every metric in order", () => {
  const achieved: Achieved = { band: null, negatives: null, pullup: null, ringdip: null };
  const rows = roadmapStatus(achieved, "2026-09-04");
  assert.deepEqual(rows.map((r) => r.metric.key), METRICS.map((m) => m.key));
});
