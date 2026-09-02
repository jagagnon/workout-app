import Link from "next/link";
import { sql } from "../../db/client";
import { planForDate } from "../../lib/plans";
import { recentPerExercise } from "../../lib/progress";
import { LogForm, type RegistryRow } from "./LogForm";

export const dynamic = "force-dynamic";

function todayZurich(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
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
      select id, canonical_name, family, default_load_type, primary_metric
      from exercise order by canonical_name
    ` as unknown as Promise<RegistryRow[]>,
  ]);

  // One round-trip for the whole session's history, not one per card.
  const planned = (plan?.items ?? []).map((i) => i.exercise);
  const history = await recentPerExercise(planned);

  return (
    <main className="wrap">
      <header className="topbar rise">
        <div>
          <Link href="/" className="back">&larr; Dashboard</Link>
          <h1 className="wordmark" style={{ fontSize: "clamp(28px, 6vw, 44px)" }}>Log</h1>
        </div>
      </header>
      <LogForm
        date={date}
        plan={plan}
        registry={registry}
        history={Object.fromEntries(history.map((h) => [h.canonical_name, h.points]))}
      />
    </main>
  );
}
