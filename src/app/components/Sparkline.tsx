"use client";
import { AreaChart, Area, Line, XAxis, Tooltip, ResponsiveContainer } from "recharts";

export type SparkPoint = { t: number; label: string; v: number };

function Tip({ active, payload, fmt }: {
  active?: boolean;
  payload?: Array<{ payload: SparkPoint }>;
  fmt: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="tip">
      <div className="tip-d">{p.label}</div>
      <div className="tip-v">{fmt(p.v)}</div>
    </div>
  );
}

// Shared by the PR board and the /log history strips — one sparkline, not two.
export function Sparkline({ data, fmt, height = 36 }: {
  data: SparkPoint[];
  fmt: (v: number) => string;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 4, right: 2, bottom: 2, left: 2 }}>
        <defs>
          <linearGradient id="prSpark" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.3} />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
          </linearGradient>
        </defs>
        {/* Hidden, but numeric: spaces points by real elapsed time rather than by index. */}
        <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} hide />
        <Tooltip content={<Tip fmt={fmt} />} cursor={{ stroke: "var(--line-bright)" }} />
        <Area type="monotone" dataKey="v" stroke="none" fill="url(#prSpark)" isAnimationActive={false} />
        <Line
          type="monotone"
          dataKey="v"
          stroke="var(--accent)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 3.5, fill: "var(--accent)", stroke: "var(--bg)", strokeWidth: 1.5 }}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
