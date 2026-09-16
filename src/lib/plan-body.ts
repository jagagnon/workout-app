import type { PlanItem, LoadType, MetricType } from "./types";

// Parses the verbatim `W:` / `A1:` / `F:` block the generator writes into
// plan.body back into structured items.
//
// This exists because `body` is the only prescription every existing plan has:
// plan.items is newer, and until the generator has been re-connected and has run,
// /log would otherwise open empty. `items` always wins when present — this is the
// fallback, and it is deliberately forgiving, because `body` is written by hand
// and drifts (`x` vs `×`, inline loads on Lower days, trailing notes).

const SPEC = /(\d+(?:[.,]\d+)?(?:-\d+(?:[.,]\d+)?)?)\s*[x×]\s*(\d+(?:[.,]\d+)?(?:[-–]\d+(?:[.,]\d+)?)*)\s*(s|m)?\b/i;
const INLINE_LOAD = /(\d+(?:[.,]\d+)?)\s*kg/i;

function topOf(range: string): number | null {
  const nums = range.match(/\d+(?:[.,]\d+)?/g);
  if (!nums?.length) return null;
  return Number(nums[nums.length - 1].replace(",", "."));
}

function parseOne(label: string, block: string, raw: string): PlanItem | null {
  let text = raw.trim();
  if (!text) return null;

  // Trailing notes in parentheses are a cue ("(L emphasis)"), unless they are
  // part of the lift's own name ("Weighted pull-ups (pronated) 4×3-5").
  let cue: string | null = null;
  const trailingParen = text.match(/\(([^)]*)\)\s*$/);
  if (trailingParen && SPEC.test(text.slice(0, trailingParen.index))) {
    cue = trailingParen[1];
    text = text.slice(0, trailingParen.index).trim();
  }

  // "/side" in plan text is a reps-per-leg annotation ("3x10/side") and carries no
  // load information, so it is stripped rather than parsed.
  text = text.replace(/\/\s*side\b/gi, " ").replace(/\s{2,}/g, " ").trim();

  let loadType: LoadType | undefined;
  let loadValue: number | null = null;
  if (/\bbodyweight\b/i.test(text)) {
    loadType = "bodyweight";
    text = text.replace(/\bbodyweight\b/i, " ").trim();
  }

  const spec = text.match(SPEC);
  let sets: number | null = null;
  let reps: string | null = null;
  let metricType: MetricType = "reps";
  let name = text;

  if (spec) {
    sets = topOf(spec[1]);
    reps = spec[2].replace(/–/g, "-");
    if (spec[3]?.toLowerCase() === "s") metricType = "seconds";
    else if (spec[3]?.toLowerCase() === "m") metricType = "meters";
    name = text.slice(0, spec.index).trim();
  }

  // Lower-day lines carry the load inline ("Goblet squat 22.5kg 3x8-10").
  const load = name.match(INLINE_LOAD);
  if (load) {
    loadValue = Number(load[1].replace(",", "."));
    loadType = loadType ?? "external";
    name = (name.slice(0, load.index) + name.slice(load.index! + load[0].length)).trim();
  }

  name = name.replace(/[\s,;–-]+$/, "").trim();
  if (!name) return null;

  return {
    block, label, exercise: name, sets, reps,
    tempo: null, load_type: loadType, load_value: loadValue,
    metric_type: metricType, cue,
  };
}

export interface Preface {
  warmup: string[];
  plyo: string[];
}

// Warm-up (`W`) and plyo (`A`) are prescribed but never logged — their
// movements mostly aren't canonical exercises, so they never belong in
// `parsePlanBody`'s output. Julien still wants them visible on the page
// though, read off as a preface ahead of the loggable blocks, so this pulls
// just those two lines out of `body` as plain text rather than structured
// items.
export function extractPreface(body: string | null | undefined): Preface {
  const warmup: string[] = [];
  const plyo: string[] = [];
  if (!body) return { warmup, plyo };

  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const w = trimmed.match(/^W\s*:\s*(.+)$/i);
    if (w) {
      warmup.push(...w[1].split(",").map((s) => s.trim()).filter(Boolean));
      continue;
    }

    for (const segment of trimmed.split("|")) {
      const a = segment.trim().match(/^A\d*\s*:\s*(.+)$/i);
      if (a) plyo.push(a[1].trim());
    }
  }
  return { warmup, plyo };
}

export function parsePlanBody(body: string | null | undefined): PlanItem[] {
  if (!body) return [];
  const items: PlanItem[] = [];

  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // The warm-up is prescribed but never logged as a result.
    if (/^W\s*:/i.test(trimmed)) continue;

    for (const segment of trimmed.split("|")) {
      const m = segment.trim().match(/^([A-Z])(\d*)\s*:\s*(.+)$/);
      if (!m) continue;
      const [, blockLetter, num, rest] = m;

      // An unnumbered label (typically "F:") can carry several comma-separated
      // finishers on one line; a numbered one is a single slot.
      const parts = num ? [rest] : rest.split(/,(?![^(]*\))/);
      parts.forEach((part, i) => {
        const label = num ? `${blockLetter}${num}` : `${blockLetter}${i + 1}`;
        const item = parseOne(label, blockLetter, part);
        if (item) items.push(item);
      });
    }
  }
  return items;
}
