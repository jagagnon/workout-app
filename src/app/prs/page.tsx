import Link from "next/link";
import { allExercisePrs } from "../../lib/progress";
import { PrTrendChart } from "../components/PrTrendChart";

export const dynamic = "force-dynamic";

export default async function PrsPage() {
  const rows = await allExercisePrs();

  return (
    <main className="wrap">
      <header className="topbar rise">
        <div>
          <Link href="/" className="back">&larr; Dashboard</Link>
          <h1 className="wordmark" style={{ fontSize: "clamp(28px, 6vw, 44px)" }}>All PRs</h1>
        </div>
      </header>
      <section className="card rise" style={{ animationDelay: "70ms" }}>
        <PrTrendChart rows={rows} />
      </section>
    </main>
  );
}
