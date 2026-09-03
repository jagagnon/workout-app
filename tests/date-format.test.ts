import { test } from "node:test";
import assert from "node:assert/strict";
import { fmtDay, fmtDayWeekday } from "../src/lib/date-format";

test("every month abbreviates to exactly three letters", () => {
  for (let m = 0; m < 12; m++) {
    const out = fmtDay(new Date(Date.UTC(2026, m, 2)));
    const month = out.replace("02 ", "");
    assert.equal(month.length, 3, `${out} — month is not three letters`);
  }
});

test("September is Sep, not Sept", () => {
  // The regression this exists for: en-GB's own short form is four letters.
  assert.equal(fmtDay("2026-09-02"), "02 Sep");
});

test("day stays first, zero-padded", () => {
  assert.equal(fmtDay("2026-08-05"), "05 Aug");
});

test("the weekday variant is trimmed too", () => {
  assert.equal(fmtDayWeekday("2026-09-02"), "Wed 02 Sep");
});
