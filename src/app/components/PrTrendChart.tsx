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

const SECTIONS: {
  key: string;
  title: string;
  match: (t: string) => boolean;
  fmt: (v: number) => string;
}[] = [
  { key: "assisted", title: "Assisted", match: (t) => t === "assisted", fmt: (v) => `${v}kg` },
  {
    key: "added",
    title: "Added / External",
    match: (t) => t === "added" || t === "external",
    fmt: (v) => (v > 0 ? `+${v}kg` : `${v}kg`),
  },
  { key: "bodyweight", title: "Bodyweight Reps", match: (t) => t === "bodyweight", fmt: (v) => `${v}` },
];

function currentFor(row: PrRow, key: string, start: number): number {
  if (key === "assisted") return row.min_assist_load == null ? start : Number(row.min_assist_load);
  if (key === "added") return row.max_added_load == null ? start : Number(row.max_added_load);
  return row.max_metric == null ? start : Number(row.max_metric);
}

function fmtDate(d: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(new Date(d));
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
    <ResponsiveContainer width="100%" height={40}>
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
          activeDot={{ r: 4, fill: "#ff5a1f", stroke: "#0a0a0c", strokeWidth: 1.5 }}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function TrendRow({ row, sectionKey, fmt }: { row: PrRow; sectionKey: string; fmt: (v: number) => string }) {
  const start = sectionKey === "bodyweight" ? Number(row.start_metric) : Number(row.start_load_value);
  const current = currentFor(row, sectionKey, start);
  const data = row.history
    .map((h) => ({
      label: fmtDate(h.date),
      v: sectionKey === "bodyweight" ? Number(h.metric_value) : h.load_value == null ? null : Number(h.load_value),
    }))
    .filter((d): d is { label: string; v: number } => d.v != null);

  return (
    <div className="pr-row">
      <Link href={`/exercise/${encodeURIComponent(row.canonical_name)}`} className="pr-name">
        {row.canonical_name}
      </Link>
      <div className="pr-spark">
        {data.length > 1 ? <Sparkline data={data} fmt={fmt} /> : <div className="pr-spark-flat" />}
      </div>
      <div className="pr-current">{fmt(current)}</div>
    </div>
  );
}

export function PrTrendChart({ rows }: { rows: PrRow[] }) {
  if (!rows.length) return <div className="empty">No PRs yet — log a session to start tracking.</div>;

  const sections = SECTIONS.map((s) => {
    const matched = rows.filter((r) => s.match(r.start_load_type));
    if (!matched.length) return null;
    return { ...s, rows: matched };
  }).filter((s): s is NonNullable<typeof s> => s != null);

  return (
    <>
      {sections.map((s) => (
        <div className="pr-section" key={s.key}>
          <div className="pr-section-title">{s.title}</div>
          {s.rows.map((r) => (
            <TrendRow key={r.exercise_id} row={r} sectionKey={s.key} fmt={s.fmt} />
          ))}
        </div>
      ))}
    </>
  );
}
