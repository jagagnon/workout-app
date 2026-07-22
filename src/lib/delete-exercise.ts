import { sql } from "../db/client";

export interface DeleteExerciseResult {
  deleted: boolean;
  exercise_id: number | null;
  canonical_name: string | null;
  entries_removed: number;
  error?: string;
}

// Matches by exact canonical name or alias, case-insensitively — no fuzzy
// matching, so a delete can never hit the wrong exercise on a typo.
export async function deleteExercise(nameOrId: string | number): Promise<DeleteExerciseResult> {
  const [exercise] = (typeof nameOrId === "number"
    ? await sql`select id, canonical_name from exercise where id = ${nameOrId}`
    : await sql`
        select id, canonical_name from exercise
        where lower(canonical_name) = lower(${nameOrId})
           or lower(${nameOrId}) = any (select lower(a) from unnest(aliases) as a)
      `) as { id: number; canonical_name: string }[];

  if (!exercise) {
    return { deleted: false, exercise_id: null, canonical_name: null, entries_removed: 0, error: "not found" };
  }

  return sql.begin(async (tx) => {
    const removed = await tx`delete from entry where exercise_id = ${exercise.id}`;
    await tx`delete from exercise where id = ${exercise.id}`;
    return {
      deleted: true,
      exercise_id: exercise.id,
      canonical_name: exercise.canonical_name,
      entries_removed: removed.count,
    };
  });
}
