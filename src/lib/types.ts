export type LoadType = "added" | "assisted" | "external" | "bodyweight";
export type MetricType = "reps" | "seconds" | "meters";

export interface EntryInput {
  exercise: string;
  metric: number;
  metric_type?: MetricType;
  load_type: LoadType;
  load_value?: number | null;
  load_unit?: string;
  per_side?: boolean;
  notes?: string;
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
