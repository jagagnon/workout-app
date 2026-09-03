// src/db/pr-baseline-data.ts
// Reviewed one-time import of the Notion PR table (snapshot 2026-06-05).
// Each record becomes ONE baseline entry dated to its Notion "Last Updated".
// Encoding rules: + => added (load +X); - => assisted (load -X); bare => external (load X);
// "(BW)" rep max => bodyweight (load null, metric = reps). Weight-only PRs use
// metric_value 1 as a ">=1 rep at this load" placeholder (only the load_value PR matters).
import type { LoadType, MetricType } from "../lib/types";

export interface PrBaseline {
  exercise: string;            // canonical name to match-or-create
  date: string;                // YYYY-MM-DD (Notion "Last Updated"; fallback 2026-06-05)
  load_type: LoadType;
  load_value: number | null;
  metric_value: number;        // reps unless metric_type set; 1 = weight-only placeholder
  metric_type?: MetricType;    // default "reps"
  aliases?: string[];          // used only when the exercise must be created
}

export const PR_BASELINE: PrBaseline[] = [
  // --- matches to already-seeded exercises ---
  { exercise: "Muscle-up", date: "2026-03-28", load_type: "assisted", load_value: -25, metric_value: 1 },
  { exercise: "Chin-ups", date: "2026-06-05", load_type: "added", load_value: 12, metric_value: 1 },
  { exercise: "Dips", date: "2026-03-29", load_type: "added", load_value: 10, metric_value: 1 },
  { exercise: "Dips", date: "2026-04-02", load_type: "bodyweight", load_value: null, metric_value: 13 },
  { exercise: "Pull-ups", date: "2026-04-02", load_type: "added", load_value: 5, metric_value: 10 },
  { exercise: "Push-ups", date: "2026-03-28", load_type: "added", load_value: 15, metric_value: 1 },
  { exercise: "Bulgarian split squat", date: "2026-05-06", load_type: "external", load_value: 12, metric_value: 1 },
  { exercise: "Goblet cossack squat", date: "2026-04-19", load_type: "external", load_value: 8, metric_value: 1 },
  { exercise: "Single leg RDL", date: "2026-05-15", load_type: "external", load_value: 4, metric_value: 1 },
  { exercise: "Single-arm farmer's carry", date: "2026-05-06", load_type: "external", load_value: 20, metric_value: 1, metric_type: "meters" },
  { exercise: "Single-arm landmine press", date: "2026-05-31", load_type: "external", load_value: 27.5, metric_value: 1 },
  { exercise: "Straight-arm pulldown", date: "2026-03-16", load_type: "external", load_value: 20, metric_value: 1 },
  { exercise: "Kneeling KB press", date: "2026-05-31", load_type: "external", load_value: 8, metric_value: 1 },

  // --- new exercises (lower-body / accessory roster) ---
  { exercise: "Banded step-down", date: "2026-05-01", load_type: "external", load_value: 8, metric_value: 1, aliases: ["banded step down", "step-down"] },
  { exercise: "Dead bugs", date: "2026-03-18", load_type: "external", load_value: 3, metric_value: 1, aliases: ["dead bug"] },
  { exercise: "Hip thrust isometric hold", date: "2026-05-15", load_type: "external", load_value: 20, metric_value: 1, metric_type: "seconds", aliases: ["hip thrust hold", "hip thrust isometric"] },
  { exercise: "High pull-ups", date: "2026-03-28", load_type: "assisted", load_value: -15, metric_value: 1, aliases: ["high pull", "High pulls"] },
  { exercise: "Ipsilateral KB RDL to knee drive", date: "2026-05-01", load_type: "external", load_value: 4, metric_value: 1, aliases: ["ipsilateral kb rdl", "kb rdl to knee drive"] },
  { exercise: "Lunge to high knee", date: "2026-05-15", load_type: "external", load_value: 20, metric_value: 1 },
  { exercise: "Kickstand RDL", date: "2026-05-20", load_type: "external", load_value: 10, metric_value: 1, aliases: ["kickstand rdl"] },
  { exercise: "Lateral step ups", date: "2026-06-05", load_type: "external", load_value: 8, metric_value: 1, aliases: ["lateral step up", "lateral step-up"] },
  { exercise: "Pelvic drops", date: "2026-06-01", load_type: "external", load_value: 10, metric_value: 1, aliases: ["pelvic drop"] },
  { exercise: "Reverse lunge", date: "2026-03-30", load_type: "external", load_value: 16, metric_value: 1 },
  { exercise: "Seated machine row", date: "2026-03-31", load_type: "external", load_value: 26, metric_value: 1 },
  { exercise: "Seated single arm row", date: "2026-03-16", load_type: "external", load_value: 15.5, metric_value: 1, aliases: ["seated single-arm row"] },
  { exercise: "Single leg deficit heel raise", date: "2026-05-06", load_type: "external", load_value: 8, metric_value: 1, aliases: ["single-leg deficit heel raise", "deficit heel raise"] },
  { exercise: "Single-hip thrust", date: "2026-03-30", load_type: "external", load_value: 7, metric_value: 1, aliases: ["single leg hip thrust", "single-leg hip thrust"] },
  { exercise: "Step-ups", date: "2026-05-20", load_type: "external", load_value: 16, metric_value: 1, aliases: ["step up", "step-up"] },
  { exercise: "Suitcase deadlift", date: "2026-05-15", load_type: "external", load_value: 20, metric_value: 1, aliases: ["suitcase deadlifts"] },
  { exercise: "Weighted pullover", date: "2026-05-14", load_type: "external", load_value: 12, metric_value: 1, aliases: ["pullover"] },
  { exercise: "Supine KB hip flexion/extension", date: "2026-06-01", load_type: "external", load_value: 10, metric_value: 6, aliases: ["supine kb hip flexion", "supine hip flexion extension"] },
  { exercise: "Touchdown squats", date: "2026-06-01", load_type: "external", load_value: 12, metric_value: 1, aliases: ["touchdown squat"] },
  { exercise: "Two-handed KB deadlift", date: "2026-06-01", load_type: "external", load_value: 32, metric_value: 1, aliases: ["two handed kb deadlift", "kb deadlift"] },
  { exercise: "Weighted Copenhagen plank", date: "2026-03-30", load_type: "external", load_value: 2.5, metric_value: 1, metric_type: "seconds", aliases: ["copenhagen plank"] },
];
