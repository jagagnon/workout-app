import { sql } from "../db/client";
import type { PlanItem } from "./types";

export type Region = "U" | "L";
export type Stimulus = "Strength" | "Hypertrophy" | "Volume";

export interface PlanInput {
  date?: string;
  region: Region;
  stimulus?: Stimulus | null;
  body: string;
  items?: PlanItem[] | null;
}
export interface PlanRow {
  date: string;
  region: string;
  stimulus: string | null;
  body: string;
  items: PlanItem[] | null;
}

// Local TZ-correct "today" (mirrors log-workout.ts; kept self-contained).
function todayZurich(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

export async function logPlan(input: PlanInput): Promise<PlanRow> {
  const date = input.date ?? todayZurich();
  // sql.json() so postgres.js sends real jsonb; its JSONValue type doesn't admit a
  // top-level array, hence the cast.
  const items = input.items == null ? null : sql.json(input.items as never);
  const [row] = await sql`
    insert into plan (date, region, stimulus, body, items)
    values (${date}, ${input.region}, ${input.stimulus ?? null}, ${input.body}, ${items}::jsonb)
    on conflict (date, region) do update set
      stimulus = excluded.stimulus, body = excluded.body,
      -- coalesce, not overwrite: a caller that still sends body only (the pre-items
      -- skill version) must not blank out a structured prescription already stored.
      items = coalesce(excluded.items, plan.items)
    returning date, region, stimulus, body, items
  `;
  return row as unknown as PlanRow;
}

export async function recentPlans(region: Region, limit = 4): Promise<PlanRow[]> {
  return (await sql`
    select date, region, stimulus, body, items
    from plan
    where region = ${region}
    order by date desc
    limit ${limit}
  `) as unknown as PlanRow[];
}

// Today's prescription for /log. Region omitted → whichever plan exists for that
// date (there is at most one per region; prefer the most recently written).
export async function planForDate(date: string, region?: Region): Promise<PlanRow | null> {
  const [row] = await sql`
    select date, region, stimulus, body, items
    from plan
    where date = ${date}
    ${region ? sql`and region = ${region}` : sql``}
    order by region
    limit 1
  `;
  return (row as unknown as PlanRow) ?? null;
}
