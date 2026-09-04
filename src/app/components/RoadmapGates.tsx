import { CHECKPOINTS, GOAL, roadmapStatus, type Achieved } from "../../lib/roadmap";
import { fmtDay } from "../../lib/date-format";

export function RoadmapGates({ achieved, today }: { achieved: Achieved; today: string }) {
  const rows = roadmapStatus(achieved, today);
  const current = CHECKPOINTS.find((c) => c.date >= today) ?? null;
  const behind = rows.filter((r) => r.onTrack === false).length;

  return (
    <>
      <div className="gate-head">
        <span className="gate-target">
          {current ? `Next gate · ${current.label} · phase ${current.phase}` : GOAL.label}
        </span>
        <span className={`gate-verdict${behind ? " off" : ""}`}>
          {behind === 0 ? "all on track" : `${behind} behind`}
        </span>
      </div>

      <div className="gates">
        {rows.map((r) => (
          <div className="gate" key={r.metric.key}>
            <div className="gate-name">{r.metric.label}</div>

            <div className="gate-now">
              {r.achieved ? (
                <>
                  <span className={r.onTrack === false ? "off" : "on"}>
                    {r.metric.format(r.achieved.value)}
                  </span>
                  <span className="gate-when">{fmtDay(r.achieved.date)}</span>
                </>
              ) : (
                <span className="gate-none">never logged</span>
              )}
            </div>

            {/* One pip per checkpoint, left to right. Because gates are judged on
                all-time bests they only ever fill forward, so the run of solid
                pips is literally how far along the roadmap this metric is. */}
            <div className="gate-pips">
              {CHECKPOINTS.map((c, i) => (
                <span
                  key={c.date}
                  className={[
                    "pip",
                    r.cleared[i] ? "hit" : "",
                    c.targets[r.metric.key] == null ? "ungated" : "",
                    current?.date === c.date ? "now" : "",
                  ].join(" ").trim()}
                  title={`${c.label}: ${c.display[r.metric.key]}`}
                />
              ))}
            </div>

            <div className="gate-goal">
              {r.currentTarget == null
                ? <span className="gate-none">not gated</span>
                : r.onTrack
                  ? <span className="on">met</span>
                  : <span className="off">
                      {current ? current.display[r.metric.key] : ""}
                      {r.shortBy != null && <span className="gate-gap"> −{r.shortBy}</span>}
                    </span>}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
