"use client";
import { Fragment } from "react";
import Link from "next/link";
import { Sparkline } from "./Sparkline";
import { clusterByFamily } from "../../lib/family-groups";

type HistoryPoint = {
  date: string; load_type: string; load_value: number | null;
  metric_value: number; metric_type: string;
};

type PrRow = {
  exercise_id: number;
  canonical_name: string;
  is_key: boolean;
  family: string | null;
  max_added_load: number | null;
  min_assist_load: number | null;
  max_metric: number | null;
  history: HistoryPoint[];
};

type Bucket = "assisted" | "added" | "reps" | "hold" | "distance";

// Each section owns its own axis and unit. Holds are measured in seconds and reps in
// reps — putting them on one shared scale ranked a 30s hold above 15 push-ups.
// Values stay signed so that, in every section, rightward means better.
const SECTIONS: Record<Bucket, { title: string; caption: string; fmt: (v: number) => string }> = {
  assisted: {
    title: "Assisted",
    caption: "assistance dropping toward bodyweight →",
    fmt: (v) => `${Math.abs(v)}kg`,
  },
  added: {
    title: "Loaded",
    caption: "load added →",
    fmt: (v) => `${v > 0 ? "+" : ""}${v}kg`,
  },
  reps: { title: "Bodyweight Reps", caption: "reps →", fmt: (v) => `${v}` },
  hold: { title: "Holds", caption: "seconds held →", fmt: (v) => `${v}s` },
  distance: { title: "Carries", caption: "metres →", fmt: (v) => `${v}m` },
};
const ORDER: Bucket[] = ["assisted", "added", "reps", "hold", "distance"];

function dominant<T>(items: T[], of: (t: T) => string): string | null {
  const counts = new Map<string, number>();
  for (const i of items) {
    const k = of(i);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  let best: { k: string; n: number } | null = null;
  for (const [k, n] of counts) if (!best || n > best.n) best = { k, n };
  return best?.k ?? null;
}

// An exercise's logged mode isn't fixed — Julien sometimes adds weight to a lift he
// otherwise tracks bodyweight-only (or vice versa). Classify by whichever mode
// dominates the history (ties broken by the most recent session), not just the
// first-ever entry, so one early outlier session can't lock the wrong axis in.
function decideBucket(history: HistoryPoint[]): Bucket {
  if (history.some((h) => h.load_type === "assisted")) return "assisted";
  const addedCount = history.filter((h) => h.load_type === "added" || h.load_type === "external").length;
  const bwCount = history.filter((h) => h.load_type === "bodyweight").length;

  let loaded: boolean;
  if (addedCount === 0) loaded = false;
  else if (bwCount === 0) loaded = true;
  else if (addedCount !== bwCount) loaded = addedCount > bwCount;
  else {
    const lastType = history[history.length - 1].load_type;
    loaded = lastType === "added" || lastType === "external";
  }
  if (loaded) return "added";

  // Unloaded work is ranked by its metric, so the metric's unit picks the section.
  const metric = dominant(history, (h) => h.metric_type);
  return metric === "seconds" ? "hold" : metric === "meters" ? "distance" : "reps";
}

// A session logged bodyweight-only inside an added/assisted-mode lift is a real data
// point (0kg added, or full-bodyweight/zero-assist that day) — plot it, don't drop it.
function valueFor(point: HistoryPoint, bucket: Bucket): number | null {
  if (bucket === "reps" || bucket === "hold" || bucket === "distance") return Number(point.metric_value);
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


function DumbbellRow({
  row, bucket, start, current, min, max, fmt,
}: {
  row: PrRow; bucket: Bucket; start: number; current: number;
  min: number; max: number; fmt: (v: number) => string;
}) {
  const pct = (v: number) => (min === max ? 50 : ((v - min) / (max - min)) * 100);
  const startPct = pct(start);
  const currentPct = pct(current);
  const lo = Math.min(startPct, currentPct);
  const hi = Math.max(startPct, currentPct);
  const spark = row.history
    .map((h) => ({ t: new Date(h.date).getTime(), label: fmtDate(h.date), v: valueFor(h, bucket) }))
    .filter((d): d is { t: number; label: string; v: number } => d.v != null);

  return (
    <div className="pr-row">
      <Link
        href={`/exercise/${encodeURIComponent(row.canonical_name)}`}
        className={`pr-name${row.is_key ? " key" : ""}`}
      >
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

  // rows arrive key-lifts-first from the query; Map preserves that within each section.
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
    // Cluster same-family exercises together (e.g. all row variations) instead of
    // straight alphabetical, so the parent movement and its variants read as a group.
    const clustered = clusterByFamily(
      items.map((it) => ({ ...it, canonical_name: it.row.canonical_name, family: it.row.family, is_key: it.row.is_key })),
    );
    return { bucket, ...SECTIONS[bucket], clustered, min: Math.min(...vals), max: Math.max(...vals) };
  }).filter((s): s is NonNullable<typeof s> => s != null);

  return (
    <>
      {sections.map((s) => (
        <details className="pr-section" key={s.bucket}>
          <summary className="pr-section-head">
            <div className="pr-section-title">{s.title} <span className="pr-section-count">· {s.clustered.length}</span></div>
            <div className="pr-section-caption">{s.caption}</div>
          </summary>
          {s.clustered.map(({ item: { row, start, current }, familyHeader }) => (
            <Fragment key={row.exercise_id}>
              {familyHeader && <div className="pr-family-title">{familyHeader}</div>}
              <DumbbellRow
                row={row}
                bucket={s.bucket}
                start={start}
                current={current}
                min={s.min}
                max={s.max}
                fmt={s.fmt}
              />
            </Fragment>
          ))}
        </details>
      ))}
    </>
  );
}
