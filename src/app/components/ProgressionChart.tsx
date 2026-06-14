"use client";
import { ComposedChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

type Pt = { label: string; reps: number; load: number | null };

function Tip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="tip">
      <div className="tip-d">{label}</div>
      {payload.map((p) => (
        <div key={p.name} className="tip-v" style={{ color: p.color }}>
          {p.name}: {p.value}
        </div>
      ))}
    </div>
  );
}

export function ProgressionChart({ data }: { data: Pt[] }) {
  if (!data.length) {
    return <div className="empty center">No sessions logged for this lift yet.</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={{ top: 12, right: 8, bottom: 4, left: -10 }}>
        <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "#26262f" }} minTickGap={24} />
        <YAxis yAxisId="reps" tickLine={false} axisLine={false} width={32} />
        <YAxis yAxisId="load" orientation="right" tickLine={false} axisLine={false} width={36} unit="kg" />
        <Tooltip content={<Tip />} cursor={{ stroke: "#3a3a47" }} />
        <Line yAxisId="reps" type="monotone" dataKey="reps" name="reps" stroke="#ece6d8" strokeWidth={2} dot={{ r: 2.5, fill: "#ece6d8" }} />
        <Line yAxisId="load" type="monotone" dataKey="load" name="load" stroke="#ff5a1f" strokeWidth={2.5} dot={{ r: 3, fill: "#ff5a1f", stroke: "#0a0a0c", strokeWidth: 1.5 }} connectNulls />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
