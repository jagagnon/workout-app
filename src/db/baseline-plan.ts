// src/db/baseline-plan.ts
import { matchExercise, type ExerciseRow } from "../lib/exercises";
import type { PrBaseline } from "./pr-baseline-data";

export interface NewExercise {
  canonical_name: string;
  aliases: string[];
  primary_metric: "reps" | "seconds" | "meters";
  default_load_type: "added" | "assisted" | "external" | "bodyweight";
}
export interface PlanEntry {
  exercise: string;
  exercise_id: number | null; // null => one of newExercises (resolved at run time)
  date: string;
  load_type: PrBaseline["load_type"];
  load_value: number | null;
  metric_type: "reps" | "seconds" | "meters";
  metric_value: number;
}
export interface BaselinePlan {
  newExercises: NewExercise[];
  entries: PlanEntry[];
  dates: Set<string>;
}

export function buildBaselinePlan(records: PrBaseline[], registry: ExerciseRow[]): BaselinePlan {
  const newExercises: NewExercise[] = [];
  const entries: PlanEntry[] = [];
  const dates = new Set<string>();
  const newByName = new Map<string, NewExercise>();

  for (const r of records) {
    const metric_type = r.metric_type ?? "reps";
    const m = matchExercise(r.exercise, registry);
    // Only trust exact/alias. Fuzzy/needs_confirmation => treat as a new exercise,
    // so a near-name never silently binds to the wrong canonical lift.
    const matched = m.resolution === "exact" || m.resolution === "alias";
    if (!matched && !newByName.has(r.exercise)) {
      const ne: NewExercise = {
        canonical_name: r.exercise,
        aliases: r.aliases ?? [],
        primary_metric: metric_type,
        default_load_type: r.load_type,
      };
      newByName.set(r.exercise, ne);
      newExercises.push(ne);
    }
    entries.push({
      exercise: r.exercise,
      exercise_id: matched ? m.exercise_id : null,
      date: r.date,
      load_type: r.load_type,
      load_value: r.load_value,
      metric_type,
      metric_value: r.metric_value,
    });
    dates.add(r.date);
  }
  return { newExercises, entries, dates };
}
