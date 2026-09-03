"use client";
import { useState } from "react";
import {
  AreaChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { STIMULI } from "../../lib/types";
import { fmtDay } from "../../lib/date-format";

type Pt = { t: number; label: string; stimulus: string | null; load: number | null; metric: number; metricType: string };

const OTHER = "Other";

const METRIC_UNIT: Record<string, string> = { reps: "", seconds: "s", meters: "m" };

function LoadTip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { label: string; v: number } }> }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const v = p.v;
  const txt = v < 0 ? `${v} kg assist` : v > 0 ? `+${v} kg added` : "bodyweight";
  return (
    <div className="tip">
      <div className="tip-d">{p.label}</div>
      <div className="tip-v">{txt}</div>
    </div>
  );
}

function MetricTip({ active, payload, unit }: { active?: boolean; payload?: Array<{ payload: { label: string; v: number } }>; unit: string }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="tip">
      <div className="tip-d">{p.label}</div>
      <div className="tip-v">{p.v}{unit}</div>
    </div>
  );
}

const fmtTick = (t: number) => fmtDay(t);

function MiniChart({ data, tickFormatter, tooltip }: {
  data: Array<{ t: number; label: string; v: number }>;
  tickFormatter: (v: number) => string;
  tooltip: React.ReactElement;
}) {
  const vals = data.map((d) => d.v);
  const min = Math.floor((Math.min(0, ...vals) - 5) / 10) * 10;
  const max = Math.max(10, Math.ceil((Math.max(0, ...vals) + 5) / 10) * 10);
  const ticks: number[] = [];
  for (let t = min; t <= max; t += 10) ticks.push(t);
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 12, right: 14, bottom: 4, left: 8 }}>
        <defs>
          <linearGradient id="stimFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
          </linearGradient>
        </defs>
        {/* Spaced by real elapsed time, so training gaps are visible rather than flattened. */}
        <XAxis
          dataKey="t"
          type="number"
          scale="time"
          domain={["dataMin", "dataMax"]}
          ticks={data.map((d) => d.t)}
          tickFormatter={fmtTick}
          tickLine={false}
          axisLine={{ stroke: "var(--line)" }}
          minTickGap={24}
          padding={{ left: 20, right: 20 }}
        />
        <YAxis domain={[min, max]} ticks={ticks} tickFormatter={tickFormatter} tickLine={false} axisLine={false} width={56} allowDecimals={false} interval={0} />
        <Tooltip content={tooltip} cursor={{ stroke: "var(--line-bright)" }} />
        <Area type="monotone" dataKey="v" stroke="none" fill="url(#stimFill)" isAnimationActive={false} />
        <Line
          type="monotone"
          dataKey="v"
          stroke="var(--accent)"
          strokeWidth={2.5}
          dot={{ r: 3, fill: "var(--accent)", stroke: "var(--bg)", strokeWidth: 1.5 }}
          activeDot={{ r: 5, fill: "var(--accent)", stroke: "var(--bg)", strokeWidth: 2 }}
          connectNulls
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function StimulusTab({ data }: { data: Pt[] }) {
  const hasLoad = data.some((d) => d.load != null);
  if (hasLoad) {
    const chartData = data.filter((d) => d.load != null).map((d) => ({ t: d.t, label: d.label, v: d.load as number }));
    return <MiniChart data={chartData} tickFormatter={(v) => `${v}kg`} tooltip={<LoadTip />} />;
  }
  const unit = METRIC_UNIT[data[0]?.metricType] ?? "";
  const chartData = data.map((d) => ({ t: d.t, label: d.label, v: d.metric }));
  return <MiniChart data={chartData} tickFormatter={(v) => `${v}${unit}`} tooltip={<MetricTip unit={unit} />} />;
}

export function StimulusProgressionChart({ data, splitByStimulus }: { data: Pt[]; splitByStimulus: boolean }) {
  const order: string[] = [...STIMULI, OTHER];
  const groups = new Map<string, Pt[]>();
  for (const d of data) {
    const key = d.stimulus && (STIMULI as readonly string[]).includes(d.stimulus) ? d.stimulus : OTHER;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(d);
  }
  const tabs = order.filter((k) => groups.has(k));
  const lastStimulus = data.length ? data[data.length - 1].stimulus : null;
  const defaultTab = lastStimulus && (STIMULI as readonly string[]).includes(lastStimulus) ? lastStimulus : OTHER;
  const [active, setActive] = useState(defaultTab);

  if (!data.length) {
    return <div className="empty center">No sessions logged for this lift yet.</div>;
  }

  if (!splitByStimulus) {
    // Accessory/isolation work: reps stay ~fixed regardless of stimulus, so a split adds no signal.
    return <StimulusTab data={data} />;
  }

  const activeTab = tabs.includes(active) ? active : tabs[0];

  return (
    <div>
      {tabs.length > 1 && (
        <div className="stim-tabs">
          {tabs.map((t) => (
            <button
              key={t}
              type="button"
              className={`stim-tab${t === activeTab ? " active" : ""}`}
              onClick={() => setActive(t)}
            >
              {t}
            </button>
          ))}
        </div>
      )}
      <StimulusTab data={groups.get(activeTab)!} />
    </div>
  );
}
