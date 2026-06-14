import Link from "next/link";
import { exerciseProgression } from "../../../lib/progress";
import { ProgressionChart } from "../../components/ProgressionChart";

export const dynamic = "force-dynamic";

function fmtDate(d: unknown): string {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(new Date(d as string));
}

export default async function ExercisePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const name = decodeURIComponent(id);
  const raw = (await exerciseProgression(name)) as Array<{ date: unknown; metric_value: number; load_value: number | null }>;
  const data = raw.map((r) => ({
    label: fmtDate(r.date),
    reps: Number(r.metric_value),
    load: r.load_value == null ? null : Number(r.load_value),
  }));

  return (
    <main className="wrap">
      <header className="topbar rise">
        <div>
          <Link href="/" className="back">&larr; Dashboard</Link>
          <h1 className="wordmark" style={{ fontSize: "clamp(28px, 6vw, 44px)" }}>{name}</h1>
        </div>
      </header>
      <section className="card rise" style={{ animationDelay: "70ms" }}>
        <div className="card-title">Progression · reps &amp; load</div>
        <ProgressionChart data={data} />
      </section>
    </main>
  );
}
