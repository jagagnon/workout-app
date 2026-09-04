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
          <th>Best set</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td><Link href={`/exercise/${encodeURIComponent(String(r.canonical_name))}`}>{String(r.canonical_name)}</Link></td>
            <td className={r.max_added_load == null ? "dash" : "add"}>
              {r.max_added_load == null ? "—" : `+${Number(r.max_added_load)}`}
            </td>
            {/* Assist is stored negative; the column reads as "kg of assistance", so
                show magnitude to match the Current Assist stat rather than "-25". */}
            <td className={r.min_assist_load == null ? "dash" : "assist"}>
              {r.min_assist_load == null ? "—" : `${Math.abs(Number(r.min_assist_load))}`}
            </td>
            {/* One real set, not a lifetime high-water mark: the reps and the load
                they were done at travel together, so the row can't imply a set
                that never happened. */}
            <td>
              {r.best_metric == null ? "—" : (
                <>
                  {Number(r.best_metric)}
                  {r.best_load != null && (
                    <span className="pr-at">
                      {" @ "}
                      {Number(r.best_load) > 0 ? "+" : ""}{Number(r.best_load)}
                    </span>
                  )}
                </>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
