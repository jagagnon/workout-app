import type { LoadType } from "./types";

// The progression call the generator's LOG SESSION step 4 used to make in chat.
// If Julien logs in the app instead, that step never runs and the generator loses
// its progression memory — so /log computes the same call on submit and writes it
// into entry.notes, which get_recent_sessions reads back.
//
// The rule is mirrored in the workout-generator skill (LOG SESSION step 4).
// Keep the two in sync if either changes.

export type Call = "progress" | "hold" | "deload";

export interface AutoregulateInput {
  reps_prescribed?: string | null;   // a range as written, e.g. "6-8" (or "8")
  reps_done: number;
  rpe?: number | null;               // session RPE, 1-10
  load_type?: LoadType;
  load_value?: number | null;
  niggle?: boolean;                  // something flagged in `feel`
}

export interface AutoregulateResult {
  call: Call;
  note: string;
}

// "6-8" -> [6, 8]; "8" -> [8, 8]; "AMRAP"/null -> null (no range to judge against).
export function parseRange(reps?: string | null): [number, number] | null {
  if (!reps) return null;
  const nums = reps.match(/\d+(?:\.\d+)?/g);
  if (!nums?.length) return null;
  const lo = Number(nums[0]);
  const hi = Number(nums[nums.length - 1]);
  return [Math.min(lo, hi), Math.max(lo, hi)];
}

// Next load step: +2.5 kg on a loaded lift, and on an assisted one 2.5 kg *less*
// assistance — assisted load is stored negative, so both are +2.5.
function nextLoad(loadType?: LoadType, loadValue?: number | null): number | null {
  if (loadValue == null) return null;
  if (loadType === "added" || loadType === "external" || loadType === "assisted") {
    return Math.round((loadValue + 2.5) * 10) / 10;
  }
  return null;
}

export function autoregulate(input: AutoregulateInput): AutoregulateResult {
  const { reps_done, rpe, load_type, load_value, niggle } = input;
  const range = parseRange(input.reps_prescribed);

  if (niggle || rpe === 10 || (range && reps_done < range[0])) {
    const why = niggle ? "niggle flagged" : rpe === 10 ? "RPE 10" : `missed range (${reps_done} < ${range![0]})`;
    return { call: "deload", note: `deload/swap — ${why}` };
  }

  const atTop = range ? reps_done >= range[1] : false;
  if (atTop && (rpe == null || rpe <= 7)) {
    const step = nextLoad(load_type, load_value);
    return {
      call: "progress",
      note: step != null
        ? `progress — top of range at RPE ${rpe ?? "?"}; next ${load_type === "assisted" ? "assist" : "load"} ${step}kg`
        : `progress — top of range at RPE ${rpe ?? "?"}; add reps next time`,
    };
  }

  if (!range) {
    // Nothing prescribed to judge against — RPE alone decides.
    if (rpe != null && rpe <= 7) return { call: "progress", note: `progress — RPE ${rpe}, room to add` };
    return { call: "hold", note: `hold — RPE ${rpe ?? "?"}, no prescribed range` };
  }

  if (!atTop && (rpe == null || rpe <= 7)) {
    return { call: "progress", note: `progress — RPE ${rpe ?? "?"}; +1-2 reps toward ${range[1]}` };
  }

  return { call: "hold", note: `hold — ${reps_done}/${range[1]} at RPE ${rpe ?? "?"}` };
}
