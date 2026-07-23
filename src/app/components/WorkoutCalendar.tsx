const WEEKS = 3;
const DOW_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

type CalendarRow = { date: unknown; region: string | null; type: string | null; rpe: number | null };

function utcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setUTCDate(copy.getUTCDate() + n);
  return copy;
}

function mondayOf(d: Date): Date {
  const day = d.getUTCDay(); // 0 = Sun .. 6 = Sat
  return addDays(d, day === 0 ? -6 : 1 - day);
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const fmtTip = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "2-digit", month: "short" });

export function WorkoutCalendar({ rows }: { rows: CalendarRow[] }) {
  const today = utcDay(new Date());
  const firstMonday = addDays(mondayOf(today), -(WEEKS - 1) * 7);

  const byDay = new Map<string, Array<{ region: string | null; type: string | null; rpe: number | null }>>();
  for (const r of rows) {
    const key = isoDay(utcDay(new Date(r.date as string)));
    const list = byDay.get(key) ?? [];
    list.push({ region: r.region, type: r.type, rpe: r.rpe });
    byDay.set(key, list);
  }

  const weekRows = Array.from({ length: WEEKS }, (_, w) => {
    const weekStart = addDays(firstMonday, w * 7);
    const days = Array.from({ length: 7 }, (_, d) => {
      const date = addDays(weekStart, d);
      const key = isoDay(date);
      return { date, key, sessions: byDay.get(key) ?? [], isFuture: date > today };
    });
    const count = (region: "U" | "L") =>
      days.reduce((n, d) => n + d.sessions.filter((s) => s.region === region).length, 0);
    return { days, uCount: count("U"), lCount: count("L") };
  });

  return (
    <div className="cal">
      <div className="cal-head">
        <div className="cal-dow">
          {DOW_LABELS.map((l, i) => <span key={i}>{l}</span>)}
        </div>
        <div className="cal-head-spacer" />
      </div>
      {weekRows.map((wk, i) => (
        <div className="cal-week" key={i}>
          <div className="cal-days">
            {wk.days.map((d) => (
              <div className={`cal-day${d.isFuture ? " future" : ""}`} key={d.key}>
                <span className="cal-daynum">{d.date.getUTCDate()}</span>
                <span className="cal-dots">
                  {d.sessions.map((s, j) => (
                    <span key={j} className={`cal-dot${s.region === "U" ? " u" : s.region === "L" ? " l" : ""}`} />
                  ))}
                </span>
                {d.sessions.length > 0 && (
                  <div className="cal-tip">
                    {d.sessions.map((s, j) => (
                      <div key={j}>
                        {fmtTip.format(d.date)}
                        {" · "}{s.region === "U" ? "Upper" : s.region === "L" ? "Lower" : "—"}
                        {s.type && ` · ${s.type}`}
                        {s.rpe != null && ` · RPE ${s.rpe}`}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="cal-count">U {wk.uCount} · L {wk.lCount}</div>
        </div>
      ))}
    </div>
  );
}
