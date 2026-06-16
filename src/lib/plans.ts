import { sql } from "../db/client";

export type Region = "U" | "L";
export type Stimulus = "Strength" | "Hypertrophy" | "Volume";

export interface PlanInput {
  date?: string;
  region: Region;
  stimulus?: Stimulus | null;
  body: string;
}
export interface PlanRow {
  date: string;
  region: string;
  stimulus: string | null;
  body: string;
}

// Local TZ-correct "today" (mirrors log-workout.ts; kept self-contained).
function todayZurich(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

export async function logPlan(input: PlanInput): Promise<PlanRow> {
  const date = input.date ?? todayZurich();
  const [row] = await sql`
    insert into plan (date, region, stimulus, body)
    values (${date}, ${input.region}, ${input.stimulus ?? null}, ${input.body})
    on conflict (date, region) do update set
      stimulus = excluded.stimulus, body = excluded.body
    returning date, region, stimulus, body
  `;
  return row as unknown as PlanRow;
}

export async function recentPlans(region: Region, limit = 4): Promise<PlanRow[]> {
  return (await sql`
    select date, region, stimulus, body
    from plan
    where region = ${region}
    order by date desc
    limit ${limit}
  `) as unknown as PlanRow[];
}
