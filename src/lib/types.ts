export type LoadType = "added" | "assisted" | "external" | "bodyweight";
export type MetricType = "reps" | "seconds" | "meters";

export const STIMULI = ["Strength", "Hypertrophy", "Volume"] as const;
export type Stimulus = (typeof STIMULI)[number];

export interface EntryInput {
  exercise: string;
  metric: number;
  metric_type?: MetricType;
  load_type: LoadType;
  load_value?: number | null;
  load_unit?: string;
  notes?: string;
  sets?: number | null;
  // Recorded, not omitted: a skip is an adherence signal. Excluded from every
  // PR/progression query (see src/lib/progress.ts and the v_prs view).
  skipped?: boolean;
}

// The structured prescription written alongside plan.body. Carries what `body`
// deliberately drops — load and tempo — so /log can pre-fill the form.
export interface PlanItem {
  block?: string;
  label?: string;
  exercise: string;
  sets?: number | null;
  reps?: string | null;      // a range ("6-8"); string on purpose
  tempo?: string | null;     // display-only, never an input
  load_type?: LoadType;
  load_value?: number | null;
  metric_type?: MetricType;
  cue?: string | null;
}

export interface LogInput {
  date?: string;
  region?: "U" | "L";
  type?: "Strength" | "Hypertrophy" | "Volume";
  rpe?: number;
  feel?: string;
  mu_note?: string;
  entries: EntryInput[];
}

export interface ResolvedEntry {
  input: EntryInput;
  exercise_id: number | null;
  canonical_name: string | null;
  resolution: "exact" | "alias" | "fuzzy" | "needs_confirmation";
  candidates?: string[];
}
