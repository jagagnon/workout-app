import Link from "next/link";
import { muscleUpContext, muscleUpLadder, prBoard, recentCalendar, roadmapAchieved } from "../lib/progress";
import { LadderChart } from "./components/LadderChart";
import { PrBoard } from "./components/PrBoard";
import { WorkoutCalendar } from "./components/WorkoutCalendar";
import { RoadmapGates } from "./components/RoadmapGates";
import { fmtDay } from "../lib/date-format";

export const dynamic = "force-dynamic";

const GOAL = new Date("2026-12-01T00:00:00Z");
const PROGRAM_START = new Date("2026-06-01T00:00:00Z");

const fmtDate = (d: unknown) => fmtDay(d as string);

// Upper's warm-up isn't generated per session (see workout-generator SKILL.md) —
// Julien runs this same fixed routine on his own before every Upper session, so
// it lives here as a standing reference rather than in any one day's plan.
const UPPER_WARMUP = [
  "Y-W-T",
  "Scap pulls",
  "Straight-arm pulldowns",
  "Single-arm banded punch",
  "Elbow scap push-ups",
  "Ring shrugs",
  "Bottom-position dip scap hold/pulses",
];

export default async function Home() {
  const [ladderRaw, prs, calendarRows, muCtx, achieved] = await Promise.all([
    muscleUpLadder(), prBoard(), recentCalendar(), muscleUpContext(), roadmapAchieved(),
  ]);
  const today = new Date().toISOString().slice(0, 10);

  const ladder = (ladderRaw as Array<{ date: unknown; load_value: number | null; metric_value: number }>)
    .filter((r) => r.load_value != null)
    .map((r) => ({
      t: new Date(r.date as string).getTime(),
      label: fmtDate(r.date),
      kg: Number(r.load_value),
      reps: Number(r.metric_value),
    }));

  const last = ladder.length ? ladder[ladder.length - 1] : null;
  const currentKg = last ? last.kg : null;

  const days = Math.max(0, Math.ceil((GOAL.getTime() - Date.now()) / 86_400_000));
  const elapsed = Math.min(1, Math.max(0,
    (Date.now() - PROGRAM_START.getTime()) / (GOAL.getTime() - PROGRAM_START.getTime())));

  const assistSub =
    currentKg == null ? "no data yet"
    : currentKg < 0 ? `${Math.abs(currentKg)} kg from a clean rep`
    : currentKg === 0 ? "bodyweight reached — ascend"
    : `+${currentKg} kg weighted`;

  // The ladder only moves when a muscle-up is logged, so the headline number can sit
  // still while training continues. Say when it was set, and what has happened since.
  const staleNote =
    muCtx.upper_since > 0
      ? ` · ${muCtx.upper_since} upper session${muCtx.upper_since === 1 ? "" : "s"} since`
      : " · latest session";

  return (
    <main className="wrap">
      <header className="topbar rise" style={{ animationDelay: "0ms" }}>
        <div>
          <div className="kicker">Strength · Actuals</div>
          <h1 className="wordmark">The Muscle&#8209;Up<br /><span>Project</span></h1>
          <Link href="/log" className="log-link">Log today&rsquo;s session &rarr;</Link>
        </div>
        <div className="countdown">
          <div className="num">{days}</div>
          <div className="lbl">days to goal · Dec &rsquo;26</div>
        </div>
      </header>

      <div className="goalrail rise" style={{ animationDelay: "40ms" }} role="img" aria-label={`${Math.round(elapsed * 100)}% of the program window elapsed`}>
        <i style={{ width: `${elapsed * 100}%` }} />
      </div>

      <section className="card hero rise" style={{ animationDelay: "70ms" }}>
        <div className="hero-chart">
          <LadderChart data={ladder} />
        </div>
      </section>

      <div className="grid">
        <section className="card stat-card rise" style={{ animationDelay: "140ms" }}>
          <div className="card-title">Current Assist</div>
          <div className="stat-value accent">
            {currentKg == null ? "—" : Math.abs(currentKg)}
            {currentKg != null && <small>KG</small>}
          </div>
          <div className="stat-sub">{assistSub}</div>
          {last && (
            <div className="stat-meta">
              <div><span className="meta-k">best set</span>{last.reps} {last.reps === 1 ? "rep" : "reps"} at this assist</div>
              <div><span className="meta-k">as of</span>{fmtDate(muCtx.last_date)}{staleNote}</div>
            </div>
          )}
        </section>

        <section className="card rise" style={{ animationDelay: "175ms" }}>
          <div className="card-title">Warm-up · Upper</div>
          <p className="log-plan-body">{UPPER_WARMUP.join(" · ")}</p>
        </section>

        <section className="card span2 rise" style={{ animationDelay: "210ms" }}>
          <div className="card-title-row">
            <div className="card-title">Roadmap Gates</div>
            <span className="cal-hint">to {GOAL.toISOString().slice(0, 7)}</span>
          </div>
          <RoadmapGates achieved={achieved} today={today} />
        </section>

        <section className="card rise" style={{ animationDelay: "245ms" }}>
          <div className="card-title-row">
            <div className="card-title">PR Board</div>
            <Link href="/prs" className="card-title-nav">All PRs &rarr;</Link>
          </div>
          <PrBoard rows={prs} />
        </section>

        <Link href="/sessions" className="card span2 cal-card rise" style={{ animationDelay: "315ms" }}>
          <div className="card-title-row">
            <div className="card-title">Training Calendar</div>
            <span className="cal-hint">Full log &rarr;</span>
          </div>
          {calendarRows.length === 0 ? (
            <div className="empty">No sessions yet. Say &ldquo;log my session&rdquo; to Claude and refresh.</div>
          ) : (
            <WorkoutCalendar rows={calendarRows} />
          )}
        </Link>
      </div>
    </main>
  );
}
