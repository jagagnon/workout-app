import Link from "next/link";

export function PrBoard({ rows }: { rows: Record<string, unknown>[] }) {
  if (!rows.length) return <div className="empty">No PRs yet — your first logged set sets the bar.</div>;
  return (
    <table className="pr">
      <thead>
        <tr>
          <th>Exercise</th>
          <th>Added</th>
          <th>Assist</th>
          <th>Best</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td><Link href={`/exercise/${encodeURIComponent(String(r.canonical_name))}`}>{String(r.canonical_name)}</Link></td>
            <td className={r.max_added_load == null ? "dash" : "add"}>
              {r.max_added_load == null ? "—" : `+${Number(r.max_added_load)}`}
            </td>
            <td className={r.min_assist_load == null ? "dash" : "assist"}>
              {r.min_assist_load == null ? "—" : `${Number(r.min_assist_load)}`}
            </td>
            <td>{r.max_metric == null ? "—" : Number(r.max_metric)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
