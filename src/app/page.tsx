import Link from "next/link";
import { muscleUpLadder, prBoard, recentSessions } from "../lib/progress";
import { formatLoad } from "../lib/load";
import type { LoadType } from "../lib/types";
import { LadderChart } from "./components/LadderChart";
import { PrBoard } from "./components/PrBoard";

export const dynamic = "force-dynamic";

const GOAL = new Date("2026-12-01T00:00:00Z");

function fmtDate(d: unknown): string {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(new Date(d as string));
}

export default async function Home() {
  const [ladderRaw, prs, sessions] = await Promise.all([
    muscleUpLadder(), prBoard(), recentSessions(8),
  ]);

  const ladder = (ladderRaw as Array<{ date: unknown; load_value: number | null }>)
    .filter((r) => r.load_value != null)
    .map((r) => ({ label: fmtDate(r.date), kg: Number(r.load_value) }));

  const currentKg = ladder.length ? ladder[ladder.length - 1].kg : null;

  const days = Math.max(0, Math.ceil((GOAL.getTime() - Date.now()) / 86_400_000));

  const assistSub =
    currentKg == null ? "no data yet"
    : currentKg < 0 ? `${Math.abs(currentKg)} kg from a clean rep`
    : currentKg === 0 ? "bodyweight reached — ascend"
    : `+${currentKg} kg weighted`;

  const sess = sessions as Array<{
    id: number; date: unknown; region: string | null; type: string | null;
    rpe: number | null; feel: string | null; mu_note: string | null;
    entries: Array<{ exercise: string; metric: number; load_type: string; load_value: number | null; unit: string }>;
  }>;

  return (
    <main className="wrap">
      <header className="topbar rise" style={{ animationDelay: "0ms" }}>
        <div>
          <div className="kicker">Strength · Actuals</div>
          <h1 className="wordmark">The Muscle&#8209;Up<br /><span>Project</span></h1>
        </div>
        <div className="countdown">
          <div className="num">{days}</div>
          <div className="lbl">days to goal · Dec &rsquo;26</div>
        </div>
      </header>

      <section className="card hero rise" style={{ animationDelay: "70ms" }}>
        <div className="hero-head">
          <div className="hero-stat">
            <div className="label">Current assist</div>
            <div className="value accent">
              {currentKg == null ? "—" : Math.abs(currentKg)}
              {currentKg != null && <small>KG</small>}
            </div>
            <div className="sub">{assistSub}</div>
          </div>
        </div>
        <div className="hero-chart">
          <LadderChart data={ladder} />
        </div>
      </section>

      <div className="grid">
        <section className="card rise" style={{ animationDelay: "140ms" }}>
          <div className="card-title-row">
            <div className="card-title">PR Board</div>
            <Link href="/prs" className="card-title-nav">All PRs &rarr;</Link>
          </div>
          <PrBoard rows={prs} />
        </section>

        <section className="card span2 rise" style={{ animationDelay: "210ms" }}>
          <div className="card-title">Recent Sessions</div>
          {sess.length === 0 ? (
            <div className="empty">No sessions yet. Say &ldquo;log my session&rdquo; to Claude and refresh.</div>
          ) : (
            <div className="sessions">
              {sess.map((s) => (
                <details className="session-row" key={s.id}>
                  <summary>
                    <span className="date">{fmtDate(s.date)}</span>
                    {s.region && <span className={`tag ${s.region === "U" ? "u" : ""}`}>{s.region === "U" ? "Upper" : "Lower"}</span>}
                    {s.type && <span className="tag">{s.type}</span>}
                    {s.rpe != null && <span className="tag">RPE {s.rpe}</span>}
                    <span className="cnt">{s.entries.length} {s.entries.length === 1 ? "lift" : "lifts"}</span>
                  </summary>
                  <div className="session-detail">
                    {s.entries.map((e, i) => (
                      <div className="entry-line" key={i}>
                        <span className="ex">{e.exercise}</span>
                        <span className="res">{e.metric} @ {formatLoad(e.load_type as LoadType, e.load_value, e.unit)}</span>
                      </div>
                    ))}
                    {s.feel && <div className="session-note"><span className="note-k">feel</span>{s.feel}</div>}
                    {s.mu_note && <div className="session-note"><span className="note-k">MU</span>{s.mu_note}</div>}
                  </div>
                </details>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
