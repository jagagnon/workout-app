export function StalledList({ rows }: { rows: { canonical_name: string; recent_best: number; sessions: number }[] }) {
  if (!rows.length) return <p>No stalled lifts 🎉</p>;
  return (
    <ul>
      {rows.map((r) => (
        <li key={r.canonical_name}>{r.canonical_name} — stuck at {r.recent_best}kg over {r.sessions} sessions</li>
      ))}
    </ul>
  );
}
