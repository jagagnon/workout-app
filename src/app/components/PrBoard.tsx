export function PrBoard({ rows }: { rows: Record<string, unknown>[] }) {
  return (
    <table>
      <thead><tr><th>Exercise</th><th>Best added/ext</th><th>Best assist</th><th>Best metric</th></tr></thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td>{String(r.canonical_name)}</td>
            <td>{r.max_added_load == null ? "—" : `${r.max_added_load}kg`}</td>
            <td>{r.min_assist_load == null ? "—" : `${r.min_assist_load}kg`}</td>
            <td>{String(r.max_metric)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
