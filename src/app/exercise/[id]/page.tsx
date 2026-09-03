import Link from "next/link";
import { exerciseProgression } from "../../../lib/progress";
import { STIMULI } from "../../../lib/types";
import { StimulusProgressionChart } from "../../components/StimulusProgressionChart";
import { fmtDay } from "../../../lib/date-format";

// A stimulus split only earns its place when the lift is actually autoregulated by
// stimulus — it carries load — and each tab still has enough sessions to show a trend.
// Deriving that from the data replaces a hardcoded name list that silently went stale
// as new calisthenics variants were added, and stops a lift with few sessions being
// fragmented into two-point tabs.
const MIN_POINTS_PER_TAB = 3;

type Row = {
  date: unknown; stimulus: string | null;
  metric_value: number; metric_type: string; load_value: number | null;
};

function shouldSplitByStimulus(rows: Row[]): boolean {
  if (!rows.some((r) => r.load_value != null)) return false;
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (r.stimulus && (STIMULI as readonly string[]).includes(r.stimulus)) {
      counts.set(r.stimulus, (counts.get(r.stimulus) ?? 0) + 1);
    }
  }
  return [...counts.values()].filter((n) => n >= MIN_POINTS_PER_TAB).length >= 2;
}

const fmtDate = (d: unknown) => fmtDay(d as string);

export const dynamic = "force-dynamic";

export default async function ExercisePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const name = decodeURIComponent(id);
  const raw = (await exerciseProgression(name)) as Row[];
  const data = raw.map((r) => ({
    t: new Date(r.date as string).getTime(),
    label: fmtDate(r.date),
    stimulus: r.stimulus,
    load: r.load_value == null ? null : Number(r.load_value),
    metric: Number(r.metric_value),
    metricType: r.metric_type,
  }));
  const splitByStimulus = shouldSplitByStimulus(raw);

  return (
    <main className="wrap">
      <header className="topbar rise">
        <div>
          <Link href="/" className="back">&larr; Dashboard</Link>
          <h1 className="wordmark" style={{ fontSize: "clamp(28px, 6vw, 44px)" }}>{name}</h1>
        </div>
      </header>
      <section className="card rise" style={{ animationDelay: "70ms" }}>
        <div className="card-title">{splitByStimulus ? "Progression · load by stimulus" : "Progression"}</div>
        <StimulusProgressionChart data={data} splitByStimulus={splitByStimulus} />
      </section>
    </main>
  );
}
