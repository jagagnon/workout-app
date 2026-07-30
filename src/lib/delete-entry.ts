import { sql } from "../db/client";
import { matchExercise, type ExerciseRow } from "./exercises";

export interface DeleteEntryResult {
  deleted: boolean;
  exercise_id: number | null;
  canonical_name: string | null;
  session_id: number | null;
  metric_value: number | null;
  error?: string;
}

// Removes one logged entry (a single session's result for one exercise) without
// touching the canonical exercise or its other history — e.g. to undo a
// mis-matched log that landed under the wrong exercise. Matches by exact
// canonical name or alias only, never fuzzy, so this can't hit the wrong entry.
export async function deleteEntry(
  date: string,
  exerciseName: string,
  region?: "U" | "L",
): Promise<DeleteEntryResult> {
  const registry = (await sql`
    select id, canonical_name, aliases from exercise
  `) as unknown as ExerciseRow[];
  const m = matchExercise(exerciseName, registry);
  if (m.exercise_id == null || m.resolution === "fuzzy") {
    return {
      deleted: false, exercise_id: null, canonical_name: null,
      session_id: null, metric_value: null, error: "exercise not found",
    };
  }

  const sessions = region
    ? await sql`select id from session where date = ${date} and region = ${region}`
    : await sql`select id from session where date = ${date}`;

  if (sessions.length === 0) {
    return {
      deleted: false, exercise_id: m.exercise_id, canonical_name: m.canonical_name,
      session_id: null, metric_value: null, error: "no session on that date",
    };
  }
  if (sessions.length > 1) {
    return {
      deleted: false, exercise_id: m.exercise_id, canonical_name: m.canonical_name,
      session_id: null, metric_value: null,
      error: "ambiguous — multiple sessions that date, specify region",
    };
  }

  const session_id = sessions[0].id as number;
  const [removed] = await sql`
    delete from entry where session_id = ${session_id} and exercise_id = ${m.exercise_id}
    returning metric_value
  `;

  if (!removed) {
    return {
      deleted: false, exercise_id: m.exercise_id, canonical_name: m.canonical_name,
      session_id, metric_value: null, error: "no logged entry for that exercise on that date",
    };
  }

  return {
    deleted: true, exercise_id: m.exercise_id, canonical_name: m.canonical_name,
    session_id, metric_value: Number(removed.metric_value),
  };
}
