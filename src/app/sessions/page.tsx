import Link from "next/link";
import { recentSessions } from "../../lib/progress";
import { formatLoad } from "../../lib/load";
import type { LoadType } from "../../lib/types";
import { fmtDay } from "../../lib/date-format";

export const dynamic = "force-dynamic";

const fmtDate = (d: unknown) => fmtDay(d as string);

export default async function SessionsPage() {
  const sessions = await recentSessions(30);

  const sess = sessions as Array<{
    id: number; date: unknown; region: string | null; type: string | null;
    rpe: number | null; feel: string | null; mu_note: string | null;
    entries: Array<{ exercise: string; metric: number; load_type: string; load_value: number | null; unit: string; sets: number | null; skipped: boolean; notes: string | null }>;
  }>;

  return (
    <main className="wrap">
      <header className="topbar rise">
        <div>
          <Link href="/" className="back">&larr; Dashboard</Link>
          <h1 className="wordmark" style={{ fontSize: "clamp(28px, 6vw, 44px)" }}>Sessions</h1>
        </div>
      </header>
      <section className="card rise" style={{ animationDelay: "70ms" }}>
        <div className="card-title">Recent Sessions</div>
        {sess.length === 0 ? (
          <div className="empty">No sessions yet. Say &ldquo;log my session&rdquo; to Claude and refresh.</div>
        ) : (
          <div className="sessions">
            {sess.map((s) => (
              <details className="session-row" key={s.id}>
                <summary>
                  <span className="date">{fmtDate(s.date)}</span>
                  {s.region && <span className={`tag ${s.region === "U" ? "u" : "l"}`}>{s.region === "U" ? "Upper" : "Lower"}</span>}
                  {s.type && <span className="tag">{s.type}</span>}
                  {s.rpe != null && <span className="tag">RPE {s.rpe}</span>}
                  <span className="cnt">{s.entries.length} {s.entries.length === 1 ? "lift" : "lifts"}</span>
                </summary>
                <div className="session-detail">
                  {s.entries.map((e, i) => (
                    <div className="entry-line" key={i}>
                      <span className="ex">
                        {e.exercise}
                        {/* Written on the log screen and, until now, never read back
                            anywhere in the app — only the generator ever saw them. */}
                        {e.notes && <span className="entry-note">{e.notes}</span>}
                      </span>
                      <span className="res">
                        {/* 3x6 and 5x6 are different sessions, so the set count leads
                            when it was recorded. Older entries have none — those still
                            read as the bare best set rather than inventing a "1x". */}
                        {e.skipped
                          ? <span className="skipped-mark">skipped</span>
                          : <>
                              {e.sets != null && <span className="sets">{e.sets}&times;</span>}
                              {e.metric} @ {formatLoad(e.load_type as LoadType, e.load_value, e.unit)}
                            </>}
                      </span>
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
    </main>
  );
}
