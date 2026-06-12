"use client";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

export function ProgressionChart({ data }: { data: { date: string; metric_value: number; load_value: number | null }[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis yAxisId="reps" tick={{ fontSize: 11 }} />
        <YAxis yAxisId="load" orientation="right" tick={{ fontSize: 11 }} />
        <Tooltip />
        <Line yAxisId="reps" type="monotone" dataKey="metric_value" stroke="#1da1f2" strokeWidth={2} dot name="reps" />
        <Line yAxisId="load" type="monotone" dataKey="load_value" stroke="#17bf63" strokeWidth={2} dot name="load" />
      </LineChart>
    </ResponsiveContainer>
  );
}
