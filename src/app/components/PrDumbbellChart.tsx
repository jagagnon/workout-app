"use client";
import Link from "next/link";
import { AreaChart, Area, Line, Tooltip, ResponsiveContainer } from "recharts";

type HistoryPoint = { date: string; load_type: string; load_value: number | null; metric_value: number };

type PrRow = {
  exercise_id: number;
  canonical_name: string;
  max_added_load: number | null;
  min_assist_load: number | null;
  max_metric: number | null;
  history: HistoryPoint[];
};

type Bucket = "assisted" | "added" | "bodyweight";

const SECTIONS: Record<Bucket, { title: string; invert: boolean; fmt: (v: number) => string }> = {
  assisted: { title: "Assisted", invert: true, fmt: (v) => `${v}kg` },
  added: { title: "Added / External", invert: false, fmt: (v) => (v > 0 ? `+${v}kg` : `${v}kg`) },
  bodyweight: { title: "Bodyweight Reps", invert: false, fmt: (v) => `${v}` },
};
const ORDER: Bucket[] = ["assisted", "added", "bodyweight"];

// An exercise's logged mode isn't fixed — Julien sometimes adds weight to a lift he
// otherwise tracks bodyweight-only (or vice versa). Classify by whichever mode
// dominates the history (ties broken by the most recent session), not just the
// first-ever entry, so one early outlier session can't lock the wrong axis in.
function decideBucket(history: HistoryPoint[]): Bucket {
  if (history.some((h) => h.load_type === "assisted")) return "assisted";
  const addedCount = history.filter((h) => h.load_type === "added" || h.load_type === "external").length;
  const bwCount = history.filter((h) => h.load_type === "bodyweight").length;
  if (addedCount === 0) return "bodyweight";
  if (bwCount === 0) return "added";
  if (addedCount !== bwCount) return addedCount > bwCount ? "added" : "bodyweight";
  const last = history[history.length - 1];
  return last.load_type === "added" || last.load_type === "external" ? "added" : "bodyweight";
}

// A session logged bodyweight-only inside an added/assisted-mode lift is a real data
// point (0kg added, or full-bodyweight/zero-assist that day) — plot it, don't drop it.
function valueFor(point: HistoryPoint, bucket: Bucket): number | null {
  if (bucket === "bodyweight") return Number(point.metric_value);
  if (point.load_type === "bodyweight") return 0;
  return point.load_value == null ? null : Number(point.load_value);
}

function currentFor(row: PrRow, bucket: Bucket, start: number): number {
  if (bucket === "assisted") return row.min_assist_load == null ? start : Number(row.min_assist_load);
  if (bucket === "added") return row.max_added_load == null ? start : Number(row.max_added_load);
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
  row, bucket, start, current, min, max, invert, fmt,
}: {
  row: PrRow; bucket: Bucket; start: number; current: number;
  min: number; max: number; invert: boolean; fmt: (v: number) => string;
}) {
  const pct = (v: number) => {
    const raw = min === max ? 50 : ((v - min) / (max - min)) * 100;
    return invert ? 100 - raw : raw;
  };
  const startPct = pct(start);
  const currentPct = pct(current);
  const lo = Math.min(startPct, currentPct);
  const hi = Math.max(startPct, currentPct);
  const spark = row.history
    .map((h) => ({ label: fmtDate(h.date), v: valueFor(h, bucket) }))
    .filter((d): d is { label: string; v: number } => d.v != null);

  return (
    <div className="pr-row">
      <Link href={`/exercise/${encodeURIComponent(row.canonical_name)}`} className="pr-name">
        {row.canonical_name}
      </Link>
      <div className="pr-spark">
        {spark.length > 1 ? <Sparkline data={spark} fmt={fmt} /> : <div className="pr-spark-flat" />}
      </div>
      <div className="pr-track">
        <div className="pr-connector" style={{ left: `${lo}%`, width: `${hi - lo}%` }} />
        <div className="pr-dot start" style={{ left: `${startPct}%` }} />
        <div className="pr-dot current" style={{ left: `${currentPct}%` }} />
        <div className="pr-val start" style={{ left: `${startPct}%` }}>{fmt(start)}</div>
        <div className="pr-val current" style={{ left: `${currentPct}%` }}>{fmt(current)}</div>
      </div>
    </div>
  );
}

export function PrDumbbellChart({ rows }: { rows: PrRow[] }) {
  if (!rows.length) return <div className="empty">No PRs yet — log a session to start tracking.</div>;

  const grouped = new Map<Bucket, Array<{ row: PrRow; start: number; current: number }>>();
  for (const row of rows) {
    const bucket = decideBucket(row.history);
    const start = valueFor(row.history[0], bucket) ?? 0;
    const current = currentFor(row, bucket, start);
    if (!grouped.has(bucket)) grouped.set(bucket, []);
    grouped.get(bucket)!.push({ row, start, current });
  }

  const sections = ORDER.map((bucket) => {
    const items = grouped.get(bucket);
    if (!items?.length) return null;
    const vals = items.flatMap((it) => [it.start, it.current]);
    return { bucket, ...SECTIONS[bucket], items, min: Math.min(...vals), max: Math.max(...vals) };
  }).filter((s): s is NonNullable<typeof s> => s != null);

  return (
    <>
      {sections.map((s) => (
        <div className="pr-section" key={s.bucket}>
          <div className="pr-section-title">{s.title}</div>
          {s.items.map(({ row, start, current }) => (
            <DumbbellRow
              key={row.exercise_id}
              row={row}
              bucket={s.bucket}
              start={start}
              current={current}
              min={s.min}
              max={s.max}
              invert={s.invert}
              fmt={s.fmt}
            />
          ))}
        </div>
      ))}
    </>
  );
}
