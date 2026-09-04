// The muscle-up roadmap's monthly checkpoints, mirrored from the generator
// skill's muscle-up-roadmap.md. The app cannot read that file — it ships with
// the skill, not the deploy — so this is a deliberate second copy. If the
// roadmap changes, both have to change; nothing here detects drift.
//
// Gates are evaluated against all-time bests: once a checkpoint is cleared it
// stays cleared, which is what makes the pips a progress bar rather than a
// current-form reading.

export type MetricKey = "band" | "negatives" | "pullup" | "ringdip";

export interface RoadmapMetric {
  key: MetricKey;
  label: string;
  /** Canonical exercise name this metric is read from. */
  exercise: string;
  /** Which number on the entry carries the metric. */
  read: "assist" | "added" | "reps" | "sets";
  /** Required metric_type for a "reps" read. A duration must never satisfy a
      count gate: 8 seconds of hold once read as 8 clean negatives. */
  metricType?: "reps" | "seconds";
  unit: string;
  /** Only sets in this rep window count — "+12-13 kg x 3-5" is a rep-qualified load. */
  reps?: [number, number];
  /** Renders an achieved or target value for display. */
  format: (v: number) => string;
}

export const METRICS: RoadmapMetric[] = [
  {
    key: "band",
    label: "Band on MU",
    exercise: "Muscle-up",
    read: "assist",
    unit: "kg",
    // Assistance is stored negative, so "less assisted" is numerically greater
    // and the same `achieved >= target` test works for every metric.
    format: (v) => (v === 0 ? "none" : `${v}kg`),
  },
  {
    // The roadmap gate is a COUNT of clean negatives. The exercise records
    // seconds (the 5-8s control hold), so the count lives in `sets` — "5 singles
    // @ 8s" is sets 5, metric 8s. Reading metric_value here compared a duration
    // against a rep target and reported the gate met at 8s.
    key: "negatives",
    label: "Unassisted negatives",
    exercise: "Muscle-up negative",
    read: "sets",
    unit: "",
    format: (v) => `${v}`,
  },
  {
    key: "pullup",
    label: "Weighted pull-up",
    exercise: "Pull-ups",
    read: "added",
    unit: "kg",
    reps: [3, 5],
    format: (v) => `+${v}kg`,
  },
  {
    key: "ringdip",
    label: "Ring dip",
    exercise: "Ring dip",
    read: "reps",
    metricType: "reps",
    unit: "",
    format: (v) => `${v}`,
  },
];

export interface Checkpoint {
  date: string;
  label: string;
  phase: string;
  /** null = not gated at this checkpoint ("maintain", "singles landing"). */
  targets: Record<MetricKey, number | null>;
  /** The roadmap's own wording, kept so a range isn't flattened to its floor. */
  display: Record<MetricKey, string>;
}

// A range target is met at its floor: "6-8 clean" is cleared by 6.
export const CHECKPOINTS: Checkpoint[] = [
  {
    date: "2026-08-31", label: "Aug 31", phase: "3",
    targets: { band: -15, negatives: 3, pullup: 9, ringdip: 7 },
    display: { band: "-15kg", negatives: "3-4", pullup: "+9-10kg", ringdip: "7-8" },
  },
  {
    date: "2026-09-30", label: "Sep 30", phase: "3",
    targets: { band: -10, negatives: 6, pullup: 12, ringdip: 9 },
    display: { band: "-10kg", negatives: "6-8", pullup: "+12-13kg", ringdip: "9-10" },
  },
  {
    date: "2026-10-31", label: "Oct 31", phase: "4",
    targets: { band: -10, negatives: 8, pullup: 15, ringdip: 10 },
    display: { band: "-10kg / transition", negatives: "8-10+", pullup: "+15-17kg", ringdip: "10" },
  },
  {
    date: "2026-11-30", label: "Nov 30", phase: "4",
    // "Singles landing" and "maintain" are judgement calls, not thresholds.
    targets: { band: 0, negatives: null, pullup: 18, ringdip: null },
    display: { band: "none", negatives: "singles landing", pullup: "+18-20kg", ringdip: "maintain" },
  },
];

export const GOAL = { date: "2026-12-31", label: "First strict unassisted bar MU" };

/** Best ever recorded for each metric; null where the lift has never been logged. */
export type Achieved = Record<MetricKey, { value: number; date: string } | null>;

export interface MetricStatus {
  metric: RoadmapMetric;
  achieved: { value: number; date: string } | null;
  /** One flag per checkpoint, in order — the pips. */
  cleared: boolean[];
  /** The checkpoint being worked toward: the first not yet past. */
  current: Checkpoint | null;
  currentTarget: number | null;
  /** null when there is nothing to be measured against (no data, or ungated). */
  onTrack: boolean | null;
  /** How far short of the current target, in the metric's own unit. */
  shortBy: number | null;
}

export function metricStatus(
  metric: RoadmapMetric,
  achieved: Achieved[MetricKey],
  today: string,
): MetricStatus {
  const cleared = CHECKPOINTS.map((c) => {
    const t = c.targets[metric.key];
    // An ungated cell counts as cleared so it never reads as a failure.
    if (t == null) return true;
    return achieved != null && achieved.value >= t;
  });

  const current = CHECKPOINTS.find((c) => c.date >= today) ?? null;
  const currentTarget = current ? current.targets[metric.key] : null;

  let onTrack: boolean | null = null;
  let shortBy: number | null = null;
  if (currentTarget != null) {
    if (achieved == null) onTrack = false;
    else {
      onTrack = achieved.value >= currentTarget;
      if (!onTrack) shortBy = Math.round((currentTarget - achieved.value) * 100) / 100;
    }
  }
  return { metric, achieved, cleared, current, currentTarget, onTrack, shortBy };
}

export function roadmapStatus(achieved: Achieved, today: string): MetricStatus[] {
  return METRICS.map((m) => metricStatus(m, achieved[m.key], today));
}
