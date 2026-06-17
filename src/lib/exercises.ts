export interface ExerciseRow {
  id: number;
  canonical_name: string;
  aliases: string[];
}
export interface MatchResult {
  exercise_id: number | null;
  canonical_name: string | null;
  resolution: "exact" | "alias" | "fuzzy" | "needs_confirmation";
  candidates?: string[];
}

const norm = (s: string) => s.toLowerCase().trim().replace(/[\s_-]+/g, " ");

function lev(a: string, b: string): number {
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
  return d[m][n];
}

export type ConflictResult =
  | { kind: "collision"; existing: string }
  | { kind: "warn"; similar: string }
  | { kind: "ok" };

// Decide whether a proposed new canonical name is safe to create.
// Hard-block only on an exact name/alias collision (the DB unique constraint
// backs this up); a shared word token is surfaced as a non-blocking warning so
// legit-but-close variations (e.g. "Paused dips" vs "Dips") still go through.
export function checkExerciseConflict(name: string, registry: ExerciseRow[]): ConflictResult {
  const q = norm(name);
  for (const e of registry) {
    if (norm(e.canonical_name) === q || e.aliases.some((a) => norm(a) === q))
      return { kind: "collision", existing: e.canonical_name };
  }
  const qTokens = new Set(q.split(" ").filter((t) => t.length >= 3));
  let best: { name: string; shared: number } | null = null;
  for (const e of registry) {
    const shared = norm(e.canonical_name)
      .split(" ")
      .filter((t) => t.length >= 3 && qTokens.has(t)).length;
    if (shared > 0 && (!best || shared > best.shared)) best = { name: e.canonical_name, shared };
  }
  return best ? { kind: "warn", similar: best.name } : { kind: "ok" };
}

export function matchExercise(raw: string, registry: ExerciseRow[]): MatchResult {
  const q = norm(raw);

  for (const e of registry) {
    if (norm(e.canonical_name) === q)
      return { exercise_id: e.id, canonical_name: e.canonical_name, resolution: "exact" };
  }
  for (const e of registry) {
    if (e.aliases.some((a) => norm(a) === q))
      return { exercise_id: e.id, canonical_name: e.canonical_name, resolution: "alias" };
  }
  let best: { e: ExerciseRow; dist: number } | null = null;
  for (const e of registry) {
    for (const cand of [e.canonical_name, ...e.aliases]) {
      const d = lev(q, norm(cand)) / Math.max(q.length, norm(cand).length);
      if (!best || d < best.dist) best = { e, dist: d };
    }
  }
  if (best && best.dist <= 0.25)
    return { exercise_id: best.e.id, canonical_name: best.e.canonical_name, resolution: "fuzzy" };

  const candidates = registry
    .map((e) => ({ name: e.canonical_name, d: lev(q, norm(e.canonical_name)) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 3)
    .map((c) => c.name);
  return { exercise_id: null, canonical_name: null, resolution: "needs_confirmation", candidates };
}
