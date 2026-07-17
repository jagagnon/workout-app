import Link from "next/link";
import { recentRuns, weeklyVolume } from "../../lib/runs";

export const dynamic = "force-dynamic";

function pace(s: number | null): string {
  if (!s) return "—";
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}/km`;
}
function dur(s: number | null): string {
  if (!s) return "—";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${m}m`;
}
function km(m: number | null): string {
  return m ? (m / 1000).toFixed(2) : "—";
}
function day(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

export default async function RunsPage() {
  const [runs, weekly] = await Promise.all([recentRuns(40), weeklyVolume(12)]);
  const maxKm = Math.max(1, ...weekly.map((w) => Number(w.distance_km)));
  const totalKm = runs.reduce((a, r) => a + (r.distance_m ?? 0), 0) / 1000;

  return (
    <main className="wrap">
      <header className="topbar rise">
        <div>
          <Link href="/" className="back">&larr; Dashboard</Link>
          <h1 className="wordmark" style={{ fontSize: "clamp(28px, 6vw, 44px)" }}>Runs</h1>
        </div>
      </header>

      {runs.length === 0 ? (
        <section className="card rise">
          <p style={{ margin: 0, opacity: 0.8 }}>
            No runs yet. Run <code>npm run ingest:coros</code> with <code>COROS_EMAIL</code> /{" "}
            <code>COROS_PASSWORD</code> set to pull your COROS history.
          </p>
        </section>
      ) : (
        <>
          <section className="card rise" style={{ animationDelay: "60ms" }}>
            <h2 style={{ marginTop: 0, fontSize: 14, letterSpacing: 0.4, opacity: 0.7 }}>WEEKLY VOLUME (km)</h2>
            <div style={{ display: "flex", gap: 6, alignItems: "flex-end", height: 120 }}>
              {weekly.map((w) => (
                <div key={w.week} style={{ flex: 1, textAlign: "center" }} title={`${w.distance_km} km · ${w.runs} runs`}>
                  <div
                    style={{
                      height: `${(Number(w.distance_km) / maxKm) * 100}px`,
                      background: "linear-gradient(#f0663f, #f0a13f)",
                      borderRadius: 3,
                    }}
                  />
                  <div style={{ fontSize: 10, opacity: 0.55, marginTop: 4 }}>{day(w.week)}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="card rise" style={{ animationDelay: "110ms" }}>
            <h2 style={{ marginTop: 0, fontSize: 14, letterSpacing: 0.4, opacity: 0.7 }}>
              RECENT RUNS · {totalKm.toFixed(0)} km shown
            </h2>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: "left", opacity: 0.55 }}>
                  <th style={{ padding: "6px 4px" }}>Date</th>
                  <th style={{ padding: "6px 4px" }}>Distance</th>
                  <th style={{ padding: "6px 4px" }}>Time</th>
                  <th style={{ padding: "6px 4px" }}>Pace</th>
                  <th style={{ padding: "6px 4px" }}>HR</th>
                  <th style={{ padding: "6px 4px" }}>Load</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} style={{ borderTop: "1px solid rgba(128,128,128,0.15)" }}>
                    <td style={{ padding: "6px 4px" }}>{day(r.start_time)}</td>
                    <td style={{ padding: "6px 4px" }}>{km(r.distance_m)} km</td>
                    <td style={{ padding: "6px 4px" }}>{dur(r.duration_s)}</td>
                    <td style={{ padding: "6px 4px" }}>{pace(r.avg_pace_s_km)}</td>
                    <td style={{ padding: "6px 4px" }}>{r.avg_hr ?? "—"}</td>
                    <td style={{ padding: "6px 4px" }}>{r.training_load ? Math.round(Number(r.training_load)) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </main>
  );
}
