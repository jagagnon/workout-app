import { sql } from "../db/client";
import { checkExerciseConflict, type ExerciseRow } from "./exercises";

export interface AddExerciseInput {
  canonical_name: string;
  aliases?: string[];
  primary_metric?: "reps" | "seconds" | "meters";
  default_load_type?: "added" | "assisted" | "external" | "bodyweight";
  family?: string;
}
export interface AddExerciseResult {
  created: boolean;
  exercise_id: number | null;
  canonical_name: string;
  collision?: string;
  warning?: string;
}

export async function addExercise(input: AddExerciseInput): Promise<AddExerciseResult> {
  const registry = (await sql`
    select id, canonical_name, aliases from exercise
  `) as unknown as ExerciseRow[];

  const conflict = checkExerciseConflict(input.canonical_name, registry);
  if (conflict.kind === "collision") {
    return { created: false, exercise_id: null, canonical_name: input.canonical_name, collision: conflict.existing };
  }

  const [row] = await sql`
    insert into exercise (canonical_name, aliases, primary_metric, default_load_type, is_key, family)
    values (${input.canonical_name}, ${input.aliases ?? []},
            ${input.primary_metric ?? "reps"}, ${input.default_load_type ?? "bodyweight"}, false, ${input.family ?? null})
    returning id
  `;
  return {
    created: true,
    exercise_id: row.id as number,
    canonical_name: input.canonical_name,
    warning: conflict.kind === "warn" ? conflict.similar : undefined,
  };
}
