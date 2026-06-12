"use client";
import { LineChart, Line, XAxis, YAxis, ReferenceLine, Tooltip, ResponsiveContainer } from "recharts";

export function LadderChart({ data }: { data: { date: string; load_value: number | null }[] }) {
  const pts = data.filter((d) => d.load_value != null);
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={pts} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <ReferenceLine y={0} stroke="#888" strokeDasharray="4 4" label="bodyweight" />
        <Tooltip />
        <Line type="monotone" dataKey="load_value" stroke="#e0245e" strokeWidth={2} dot />
      </LineChart>
    </ResponsiveContainer>
  );
}
