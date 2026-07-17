"use client";
import Link from "next/link";
import { AreaChart, Area, Line, Tooltip, ResponsiveContainer } from "recharts";

type HistoryPoint = { date: string; load_value: number | null; metric_value: number };

type PrRow = {
  exercise_id: number;
  canonical_name: string;
  start_load_type: string;
  start_load_value: number | null;
  start_metric: number;
  max_added_load: number | null;
  min_assist_load: number | null;
  max_metric: number | null;
  history: HistoryPoint[];
};

type Dumbbell = {
  exercise_id: number; canonical_name: string; start: number; current: number; history: HistoryPoint[];
};

const SECTIONS: {
  key: string;
  title: string;
  invert: boolean;
  match: (t: string) => boolean;
  fmt: (v: number) => string;
}[] = [
  {
    key: "assisted",
    title: "Assisted",
    invert: true,
    match: (t) => t === "assisted",
    fmt: (v) => `${v}kg`,
  },
  {
    key: "added",
    title: "Added / External",
    invert: false,
    match: (t) => t === "added" || t === "external",
    fmt: (v) => (v > 0 ? `+${v}kg` : `${v}kg`),
  },
  {
    key: "bodyweight",
    title: "Bodyweight Reps",
    invert: false,
    match: (t) => t === "bodyweight",
    fmt: (v) => `${v}`,
  },
];

function currentFor(row: PrRow, key: string, start: number): number {
  if (key === "assisted") return row.min_assist_load == null ? start : Number(row.min_assist_load);
  if (key === "added") return row.max_added_load == null ? start : Number(row.max_added_load);
  return row.max_metric == null ? start : Number(row.max_metric);
}

function fmtDate(d: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(new Date(d));
}

function seriesFor(history: HistoryPoint[], sectionKey: string): Array<{ label: string; v: number }> {
  return history
    .map((h) => ({
      label: fmtDate(h.date),
      v: sectionKey === "bodyweight" ? Number(h.metric_value) : h.load_value == null ? null : Number(h.load_value),
    }))
    .filter((d): d is { label: string; v: number } => d.v != null);
}

function Tip({
  active, payload, fmt,
}: { active?: boolean; payload?: Array<{ payload: { label: string; v: number } }>; fmt: (v: number) => string }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="tip">
      <div className="tip-d">{p.label}</div>
      <div className="tip-v">{fmt(p.v)}</div>
    </div>
  );
}

function Sparkline({ data, fmt }: { data: Array<{ label: string; v: number }>; fmt: (v: number) => string }) {
  return (
    <ResponsiveContainer width="100%" height={36}>
      <AreaChart data={data} margin={{ top: 4, right: 2, bottom: 2, left: 2 }}>
        <defs>
          <linearGradient id="prSpark" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ff5a1f" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#ff5a1f" stopOpacity={0} />
          </linearGradient>
        </defs>
        <Tooltip content={<Tip fmt={fmt} />} cursor={{ stroke: "#3a3a47" }} />
        <Area type="monotone" dataKey="v" stroke="none" fill="url(#prSpark)" isAnimationActive={false} />
        <Line
          type="monotone"
          dataKey="v"
          stroke="#ff5a1f"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 3.5, fill: "#ff5a1f", stroke: "#0a0a0c", strokeWidth: 1.5 }}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function DumbbellRow({
  d, min, max, invert, fmt, sectionKey,
}: { d: Dumbbell; min: number; max: number; invert: boolean; fmt: (v: number) => string; sectionKey: string }) {
  const pct = (v: number) => {
    const raw = min === max ? 50 : ((v - min) / (max - min)) * 100;
    return invert ? 100 - raw : raw;
  };
  const startPct = pct(d.start);
  const currentPct = pct(d.current);
  const lo = Math.min(startPct, currentPct);
  const hi = Math.max(startPct, currentPct);
  const spark = seriesFor(d.history, sectionKey);

  return (
    <div className="pr-row">
      <Link href={`/exercise/${encodeURIComponent(d.canonical_name)}`} className="pr-name">
        {d.canonical_name}
      </Link>
      <div className="pr-track">
        <div className="pr-connector" style={{ left: `${lo}%`, width: `${hi - lo}%` }} />
        <div className="pr-dot start" style={{ left: `${startPct}%` }} />
        <div className="pr-dot current" style={{ left: `${currentPct}%` }} />
        <div className="pr-val start" style={{ left: `${startPct}%` }}>{fmt(d.start)}</div>
        <div className="pr-val current" style={{ left: `${currentPct}%` }}>{fmt(d.current)}</div>
      </div>
      <div className="pr-spark">
        {spark.length > 1 ? <Sparkline data={spark} fmt={fmt} /> : <div className="pr-spark-flat" />}
      </div>
    </div>
  );
}

export function PrDumbbellChart({ rows }: { rows: PrRow[] }) {
  if (!rows.length) return <div className="empty">No PRs yet — log a session to start tracking.</div>;

  const sections = SECTIONS.map((s) => {
    const dumbbells: Dumbbell[] = rows
      .filter((r) => s.match(r.start_load_type))
      .map((r) => {
        const start = s.key === "bodyweight" ? Number(r.start_metric) : Number(r.start_load_value);
        return {
          exercise_id: r.exercise_id,
          canonical_name: r.canonical_name,
          start,
          current: currentFor(r, s.key, start),
          history: r.history,
        };
      });
    if (!dumbbells.length) return null;
    const vals = dumbbells.flatMap((d) => [d.start, d.current]);
    return { ...s, dumbbells, min: Math.min(...vals), max: Math.max(...vals) };
  }).filter((s): s is NonNullable<typeof s> => s != null);

  return (
    <>
      {sections.map((s) => (
        <div className="pr-section" key={s.key}>
          <div className="pr-section-title">{s.title}</div>
          {s.dumbbells.map((d) => (
            <DumbbellRow key={d.exercise_id} d={d} min={s.min} max={s.max} invert={s.invert} fmt={s.fmt} sectionKey={s.key} />
          ))}
        </div>
      ))}
    </>
  );
}
