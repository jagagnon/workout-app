import { test } from "node:test";
import assert from "node:assert/strict";
import { SEED_PLANS } from "../src/db/seed-plans";

test("seed plans: 4 Upper + 2 Lower", () => {
  assert.equal(SEED_PLANS.filter((p) => p.region === "U").length, 4);
  assert.equal(SEED_PLANS.filter((p) => p.region === "L").length, 2);
});

test("seed plans: bodies non-empty, regions valid, no duplicate (date,region)", () => {
  const seen = new Set<string>();
  for (const p of SEED_PLANS) {
    assert.ok(p.body.trim().length > 0, `${p.date} body empty`);
    assert.ok(p.region === "U" || p.region === "L");
    const key = `${p.date}:${p.region}`;
    assert.ok(!seen.has(key), `duplicate ${key}`);
    seen.add(key);
  }
});
