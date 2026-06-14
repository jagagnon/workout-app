export function StalledList({ rows }: { rows: { canonical_name: string; recent_best: number; sessions: number }[] }) {
  if (!rows.length) return <div className="empty">Nothing stalled — every tracked lift is still climbing.</div>;
  return (
    <div className="stalled">
      {rows.map((r) => (
        <div className="stalled-row" key={r.canonical_name}>
          <span className="name">{r.canonical_name}</span>
          <span className="meta">
            stuck at <b>{Number(r.recent_best)}kg</b> · {Number(r.sessions)} sessions
          </span>
        </div>
      ))}
    </div>
  );
}
