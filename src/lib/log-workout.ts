import { sql } from "../db/client";
import { matchExercise, type ExerciseRow } from "./exercises";
import { formatLoad } from "./load";
import type { LogInput } from "./types";

function todayZurich(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

export interface EntryResult {
  input: LogInput["entries"][number];
  exercise_id: number | null;
  canonical_name: string | null;
  resolution: string;
  candidates?: string[];
  written: boolean;
  is_pr: boolean;
  display: string;
}
export interface LogResult {
  date: string;
  session_id: number | null;
  results: EntryResult[];
}

export async function logWorkout(input: LogInput): Promise<LogResult> {
  const date = input.date ?? todayZurich();
  const registry = (await sql`
    select id, canonical_name, aliases from exercise
  `) as unknown as ExerciseRow[];

  const [sessionRow] = await sql`
    insert into session (date, region, type, notes)
    values (${date}, ${input.region ?? null}, ${input.type ?? null}, ${null})
    on conflict (date, region) do update set type = coalesce(excluded.type, session.type)
    returning id
  `;
  const session_id = sessionRow.id as number;

  const results: EntryResult[] = [];
  for (const e of input.entries) {
    const m = matchExercise(e.exercise, registry);
    // Never auto-write a fuzzy guess — surface it for confirmation so a wrong
    // match (e.g. "Ring muscle-up row" -> "Muscle-up") can't silently corrupt data.
    if (m.exercise_id == null || m.resolution === "fuzzy") {
      const guess = m.resolution === "fuzzy" ? m.canonical_name : null;
      results.push({
        input: e, exercise_id: null, canonical_name: null,
        resolution: "needs_confirmation",
        candidates: guess ? [guess, ...(m.candidates ?? [])] : m.candidates,
        written: false, is_pr: false,
        display: `${e.exercise} (needs confirmation${guess ? ` — did you mean ${guess}?` : ""})`,
      });
      continue;
    }

    const [prRow] = await sql`
      select
        max(load_value) filter (where load_type in ('added','external')) as max_added,
        min(load_value) filter (where load_type = 'assisted') as min_assist,
        max(metric_value) as max_metric
      from entry where exercise_id = ${m.exercise_id}
    `;
    const isPr =
      (e.load_type === "added" || e.load_type === "external")
        ? e.load_value != null && (prRow.max_added == null || e.load_value > Number(prRow.max_added))
      : e.load_type === "assisted"
        ? e.load_value != null && (prRow.min_assist == null || e.load_value > Number(prRow.min_assist))
      : (prRow.max_metric == null || e.metric > Number(prRow.max_metric));

    await sql`
      insert into entry (session_id, exercise_id, metric_type, metric_value,
                         load_type, load_value, load_unit, per_side, notes)
      values (${session_id}, ${m.exercise_id}, ${e.metric_type ?? "reps"}, ${e.metric},
              ${e.load_type}, ${e.load_value ?? null}, ${e.load_unit ?? "kg"},
              ${e.per_side ?? false}, ${e.notes ?? null})
      on conflict (session_id, exercise_id) do update set
        metric_type = excluded.metric_type, metric_value = excluded.metric_value,
        load_type = excluded.load_type, load_value = excluded.load_value,
        load_unit = excluded.load_unit, per_side = excluded.per_side, notes = excluded.notes
    `;

    results.push({
      input: e, exercise_id: m.exercise_id, canonical_name: m.canonical_name,
      resolution: m.resolution, written: true, is_pr: isPr,
      display: `${m.canonical_name} ${e.metric} @ ${formatLoad(e.load_type, e.load_value, e.load_unit ?? "kg", e.per_side ?? false)}`,
    });
  }

  return { date, session_id, results };
}
