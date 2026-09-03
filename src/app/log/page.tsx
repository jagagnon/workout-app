import Link from "next/link";
import { sql } from "../../db/client";
import { planForDate } from "../../lib/plans";
import { parsePlanBody } from "../../lib/plan-body";
import { matchExercise, type ExerciseRow } from "../../lib/exercises";
import { recentPerExercise } from "../../lib/progress";
import { LogForm, type RegistryRow } from "./LogForm";
import type { PlanItem } from "../../lib/types";

export const dynamic = "force-dynamic";

function todayZurich(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

// The form's exercise dropdown is keyed on canonical names, so a prescribed lift
// has to be resolved before it can be pre-selected. A fuzzy hit is pre-selected
// too — it shows as a canonical name in the dropdown, so a wrong guess is visible
// and one tap away from being corrected, unlike a fuzzy write.
function resolveNames(items: PlanItem[], registry: ExerciseRow[]): PlanItem[] {
  return items.map((i) => {
    const m = matchExercise(i.exercise, registry);
    return m.canonical_name ? { ...i, exercise: m.canonical_name } : { ...i, exercise: "" , cue: i.cue ?? `couldn't match "${i.exercise}"` };
  });
}

export default async function LogPage({
  searchParams,
}: { searchParams: Promise<{ date?: string; region?: string }> }) {
  const params = await searchParams;
  const date = params.date ?? todayZurich();
  const region = params.region === "U" || params.region === "L" ? params.region : undefined;

  const [plan, registry] = await Promise.all([
    planForDate(date, region),
    sql`
      select id, canonical_name, aliases, family, default_load_type, primary_metric
      from exercise order by canonical_name
    ` as unknown as Promise<Array<RegistryRow & { aliases: string[] }>>,
  ]);

  // plan.items is the structured prescription when the generator sent one;
  // otherwise parse the body block every existing plan already has.
  const raw = plan?.items?.length ? plan.items : parsePlanBody(plan?.body);
  const items = resolveNames(raw, registry);

  // One round-trip for the whole session's history, not one per card.
  const history = await recentPerExercise(items.map((i) => i.exercise).filter(Boolean));

  return (
    <main className="wrap log-page">
      <header className="topbar rise">
        <div>
          <Link href="/" className="back">&larr; Dashboard</Link>
          <h1 className="wordmark" style={{ fontSize: "clamp(28px, 6vw, 44px)" }}>Log</h1>
        </div>
      </header>
      <LogForm
        date={date}
        plan={plan}
        items={items}
        registry={registry}
        history={Object.fromEntries(history.map((h) => [h.canonical_name, h.points]))}
      />
    </main>
  );
}
