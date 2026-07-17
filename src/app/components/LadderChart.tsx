"use client";
import {
  AreaChart, Area, Line, XAxis, YAxis, ReferenceLine, Tooltip, ResponsiveContainer,
} from "recharts";

type Pt = { label: string; kg: number };

function Tip({ active, payload }: { active?: boolean; payload?: Array<{ payload: Pt }> }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const v = p.kg;
  const txt = v < 0 ? `${v} kg assist` : v > 0 ? `+${v} kg added` : "bodyweight";
  return (
    <div className="tip">
      <div className="tip-d">{p.label}</div>
      <div className="tip-v">{txt}</div>
    </div>
  );
}

export function LadderChart({ data }: { data: Pt[] }) {
  if (!data.length) {
    return <div className="empty center">No muscle-up sessions logged yet.<br />Log one to start the ladder.</div>;
  }
  const vals = data.map((d) => d.kg);
  const min = Math.floor((Math.min(0, ...vals) - 5) / 10) * 10;
  const max = Math.max(10, Math.ceil((Math.max(0, ...vals) + 5) / 10) * 10);
  const ticks: number[] = [];
  for (let t = min; t <= max; t += 10) ticks.push(t);
  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data} margin={{ top: 12, right: 14, bottom: 4, left: 8 }}>
        <defs>
          <linearGradient id="ladderFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ff5a1f" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#ff5a1f" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "#26262f" }} minTickGap={24} padding={{ left: 20, right: 20 }} />
        <YAxis domain={[min, max]} ticks={ticks} tickFormatter={(v) => `${v}kg`} tickLine={false} axisLine={false} width={56} allowDecimals={false} interval={0} />
        <ReferenceLine
          y={0}
          stroke="#6fd0e6"
          strokeDasharray="5 5"
          strokeOpacity={0.85}
          label={{ value: "BODYWEIGHT", position: "insideBottomRight", fill: "#6fd0e6", fontSize: 9, letterSpacing: 1 }}
        />
        <Tooltip content={<Tip />} cursor={{ stroke: "#3a3a47" }} />
        <Area type="monotone" dataKey="kg" stroke="none" fill="url(#ladderFill)" isAnimationActive={false} />
        <Line
          type="monotone"
          dataKey="kg"
          stroke="#ff5a1f"
          strokeWidth={2.5}
          dot={{ r: 3, fill: "#ff5a1f", stroke: "#0a0a0c", strokeWidth: 1.5 }}
          activeDot={{ r: 5, fill: "#ff5a1f", stroke: "#0a0a0c", strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
