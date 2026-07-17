import Link from "next/link";
import { exerciseProgression } from "../../../lib/progress";
import { StimulusProgressionChart } from "../../components/StimulusProgressionChart";

export const dynamic = "force-dynamic";

// Only the calisthenics compound lifts get weight/assist adjusted per stimulus —
// everything else is worked for 8-10 reps/set regardless, so a stimulus split adds no signal.
const CALI_EXERCISES = new Set([
  "Pull-ups", "Chin-ups", "Chest-to-bar pull-up", "High pulls",
  "Dips", "Paused dips", "Muscle-up",
]);

function fmtDate(d: unknown): string {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(new Date(d as string));
}

export default async function ExercisePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const name = decodeURIComponent(id);
  const raw = (await exerciseProgression(name)) as Array<{
    date: unknown; stimulus: string | null;
    metric_value: number; metric_type: string; load_value: number | null;
  }>;
  const data = raw.map((r) => ({
    label: fmtDate(r.date),
    stimulus: r.stimulus,
    load: r.load_value == null ? null : Number(r.load_value),
    metric: Number(r.metric_value),
    metricType: r.metric_type,
  }));
  const hasAnyLoad = data.some((d) => d.load != null);
  const splitByStimulus = CALI_EXERCISES.has(name) && hasAnyLoad;

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
