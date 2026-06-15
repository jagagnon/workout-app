# PR / Actuals Unification — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Neon DB the single source of truth for workout weights/PRs by importing the Notion PR table as a dated baseline, then repointing the chat-mode generator to the DB and retiring the Notion PR table + `workout-pr-tracker` skill.

**Architecture:** A curated data module holds the reviewed Notion→DB mapping (34 records). A pure planner function resolves each record against the exercise registry (match existing or mark new) and groups records into baseline sessions by date. A thin runner executes the plan against `sql` (create new exercises, upsert baseline sessions/entries idempotently). Skill edits repoint the generator and delete the PR-tracker skill.

**Tech Stack:** TypeScript, `postgres` (postgres.js), `node:test` + `tsx`, existing `matchExercise` matcher, Vercel/Neon.

**Environment note:** The controller cannot run `node`/`tsx`/`next` directly (uv_cwd EPERM + `.env` protection). Subagents executing tasks must load env with `tsx --env-file=/Users/julien/Documents/claude/workout-app/.env.local` and run all node/build/deploy from inside the repo. Tests that hit the DB are avoided — the planner is pure and unit-tested without a live connection.

---

## File Structure

- **Create** `src/db/pr-baseline-data.ts` — the reviewed 34-record mapping of the Notion PR table. Pure data + the `PrBaseline` type. One responsibility: the curated import dataset.
- **Create** `src/db/baseline-plan.ts` — `buildBaselinePlan(records, registry)`: pure function resolving records to matched/new exercises and grouping by date. No DB access. Unit-tested.
- **Create** `src/db/migrate-prs.ts` — runner: loads registry, calls planner, creates new exercises, upserts baseline sessions + entries idempotently. Thin glue.
- **Create** `tests/baseline-plan.test.ts` — unit tests for the planner + data invariants.
- **Modify** `/Users/julien/Documents/claude/workout-generator-updated/SKILL.md` — repoint PR read to MCP `get_prs`, result logging to MCP `log_workout`, drop `workout-pr-tracker` delegation.
- **Delete** `~/.claude/skills/workout-pr-tracker/` and `/Users/julien/Downloads/workout-pr-tracker.skill`.
- **Modify** `src/app/components/LadderChart.tsx` — y-axis fix (already edited locally; commit + deploy here).

---

### Task 1: Curated baseline data module

**Files:**
- Create: `src/db/pr-baseline-data.ts`
- Test: `tests/baseline-plan.test.ts` (data-invariant test added here, planner tests in Task 2)

- [ ] **Step 1: Write the data module**

```typescript
// src/db/pr-baseline-data.ts
// Reviewed one-time import of the Notion PR table (snapshot 2026-06-05).
// Each record becomes ONE baseline entry dated to its Notion "Last Updated".
// Encoding rules: + => added (load +X); - => assisted (load -X); bare => external (load X);
// "(BW)" rep max => bodyweight (load null, metric = reps). Weight-only PRs use
// metric_value 1 as a ">=1 rep at this load" placeholder (only the load_value PR matters).
import type { LoadType, MetricType } from "../lib/types";

export interface PrBaseline {
  exercise: string;            // canonical name to match-or-create
  date: string;                // YYYY-MM-DD (Notion "Last Updated"; fallback 2026-06-05)
  load_type: LoadType;
  load_value: number | null;
  metric_value: number;        // reps unless metric_type set; 1 = weight-only placeholder
  metric_type?: MetricType;    // default "reps"
  per_side?: boolean;
  aliases?: string[];          // used only when the exercise must be created
}

export const PR_BASELINE: PrBaseline[] = [
  // --- matches to already-seeded exercises ---
  { exercise: "Muscle-up", date: "2026-03-28", load_type: "assisted", load_value: -25, metric_value: 1 },
  { exercise: "Chin-ups", date: "2026-06-05", load_type: "added", load_value: 12, metric_value: 1 },
  { exercise: "Dips", date: "2026-03-29", load_type: "added", load_value: 10, metric_value: 1 },
  { exercise: "Dips", date: "2026-04-02", load_type: "bodyweight", load_value: null, metric_value: 13 },
  { exercise: "Pull-ups", date: "2026-04-02", load_type: "added", load_value: 5, metric_value: 10 },
  { exercise: "Push-ups", date: "2026-03-28", load_type: "added", load_value: 15, metric_value: 1 },
  { exercise: "Bulgarian split squat", date: "2026-05-06", load_type: "external", load_value: 12, metric_value: 1, per_side: true },
  { exercise: "Goblet cossack squat", date: "2026-04-19", load_type: "external", load_value: 8, metric_value: 1 },
  { exercise: "Single leg RDL", date: "2026-05-15", load_type: "external", load_value: 4, metric_value: 1, per_side: true },
  { exercise: "Single-arm farmer's carry", date: "2026-05-06", load_type: "external", load_value: 20, metric_value: 1, metric_type: "meters", per_side: true },
  { exercise: "Single-arm landmine press", date: "2026-05-31", load_type: "external", load_value: 27.5, metric_value: 1, per_side: true },
  { exercise: "Straight-arm pulldown", date: "2026-03-16", load_type: "external", load_value: 20, metric_value: 1 },
  { exercise: "Kneeling KB press", date: "2026-05-31", load_type: "external", load_value: 8, metric_value: 1 },

  // --- new exercises (lower-body / accessory roster) ---
  { exercise: "Banded step-down", date: "2026-05-01", load_type: "external", load_value: 8, metric_value: 1, aliases: ["banded step down", "step-down"] },
  { exercise: "Dead bugs", date: "2026-03-18", load_type: "external", load_value: 3, metric_value: 1, aliases: ["dead bug"] },
  { exercise: "Hip thrust isometric hold", date: "2026-05-15", load_type: "external", load_value: 20, metric_value: 1, metric_type: "seconds", aliases: ["hip thrust hold", "hip thrust isometric"] },
  { exercise: "High pulls", date: "2026-03-28", load_type: "assisted", load_value: -15, metric_value: 1, aliases: ["high pull"] },
  { exercise: "Ipsilateral KB RDL to knee drive", date: "2026-05-01", load_type: "external", load_value: 4, metric_value: 1, aliases: ["ipsilateral kb rdl", "kb rdl to knee drive"] },
  { exercise: "Lunge to high knee", date: "2026-05-15", load_type: "external", load_value: 20, metric_value: 1 },
  { exercise: "Kickstand RDL", date: "2026-05-20", load_type: "external", load_value: 10, metric_value: 1, aliases: ["kickstand rdl"] },
  { exercise: "Lateral step ups", date: "2026-06-05", load_type: "external", load_value: 8, metric_value: 1, aliases: ["lateral step up", "lateral step-up"] },
  { exercise: "Pelvic drops", date: "2026-06-01", load_type: "external", load_value: 10, metric_value: 1, aliases: ["pelvic drop"] },
  { exercise: "Reverse lunge", date: "2026-03-30", load_type: "external", load_value: 16, metric_value: 1 },
  { exercise: "Seated machine row", date: "2026-03-31", load_type: "external", load_value: 26, metric_value: 1 },
  { exercise: "Seated single arm row", date: "2026-03-16", load_type: "external", load_value: 15.5, metric_value: 1, per_side: true, aliases: ["seated single-arm row"] },
  { exercise: "Single leg deficit heel raise", date: "2026-05-06", load_type: "external", load_value: 8, metric_value: 1, aliases: ["single-leg deficit heel raise", "deficit heel raise"] },
  { exercise: "Single-hip thrust", date: "2026-03-30", load_type: "external", load_value: 7, metric_value: 1, aliases: ["single leg hip thrust", "single-leg hip thrust"] },
  { exercise: "Step-ups", date: "2026-05-20", load_type: "external", load_value: 16, metric_value: 1, aliases: ["step up", "step-up"] },
  { exercise: "Suitcase deadlift", date: "2026-05-15", load_type: "external", load_value: 20, metric_value: 1, aliases: ["suitcase deadlifts"] },
  { exercise: "Weighted pullover", date: "2026-05-14", load_type: "external", load_value: 12, metric_value: 1, aliases: ["pullover"] },
  { exercise: "Supine KB hip flexion/extension", date: "2026-06-01", load_type: "external", load_value: 10, metric_value: 6, aliases: ["supine kb hip flexion", "supine hip flexion extension"] },
  { exercise: "Touchdown squats", date: "2026-06-01", load_type: "external", load_value: 12, metric_value: 1, aliases: ["touchdown squat"] },
  { exercise: "Two-handed KB deadlift", date: "2026-06-01", load_type: "external", load_value: 32, metric_value: 1, aliases: ["two handed kb deadlift", "kb deadlift"] },
  { exercise: "Weighted Copenhagen plank", date: "2026-03-30", load_type: "external", load_value: 2.5, metric_value: 1, metric_type: "seconds", aliases: ["copenhagen plank"] },
];
```

- [ ] **Step 2: Write the data-invariant test**

```typescript
// tests/baseline-plan.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { PR_BASELINE } from "../src/db/pr-baseline-data";

test("baseline data: no two records collide on (date, exercise)", () => {
  const seen = new Set<string>();
  for (const r of PR_BASELINE) {
    const key = `${r.date}::${r.exercise}`;
    assert.ok(!seen.has(key), `duplicate (date,exercise): ${key}`);
    seen.add(key);
  }
});

test("baseline data: assisted loads are negative, added are positive", () => {
  for (const r of PR_BASELINE) {
    if (r.load_type === "assisted") assert.ok((r.load_value ?? 0) < 0, `${r.exercise} assisted must be negative`);
    if (r.load_type === "added") assert.ok((r.load_value ?? 0) > 0, `${r.exercise} added must be positive`);
    if (r.load_type === "bodyweight") assert.equal(r.load_value, null, `${r.exercise} bodyweight load must be null`);
  }
});

test("baseline data: 34 records imported", () => {
  assert.equal(PR_BASELINE.length, 34);
});
```

- [ ] **Step 3: Run the test to verify it passes**

Run: `cd /Users/julien/Documents/claude/workout-app && npm test`
Expected: the three baseline-data tests PASS (planner tests come in Task 2).

- [ ] **Step 4: Commit**

```bash
git add src/db/pr-baseline-data.ts tests/baseline-plan.test.ts
git commit -m "feat: curated Notion PR-table baseline data (34 records)"
```

---

### Task 2: Pure baseline planner

**Files:**
- Create: `src/db/baseline-plan.ts`
- Test: `tests/baseline-plan.test.ts` (extend)

- [ ] **Step 1: Write the failing planner tests**

Append to `tests/baseline-plan.test.ts`:

```typescript
import { buildBaselinePlan } from "../src/db/baseline-plan";
import type { ExerciseRow } from "../src/lib/exercises";
import type { PrBaseline } from "../src/db/pr-baseline-data";

const REGISTRY: ExerciseRow[] = [
  { id: 2, canonical_name: "Muscle-up", aliases: ["muscle up", "mu"] },
  { id: 4, canonical_name: "Dips", aliases: ["dip"] },
];

const RECORDS: PrBaseline[] = [
  { exercise: "Muscle-up", date: "2026-03-28", load_type: "assisted", load_value: -25, metric_value: 1 },
  { exercise: "Dips", date: "2026-03-29", load_type: "added", load_value: 10, metric_value: 1 },
  { exercise: "Two-handed KB deadlift", date: "2026-03-29", load_type: "external", load_value: 32, metric_value: 1, aliases: ["kb deadlift"] },
];

test("planner: existing exercise resolves to its id, not flagged new", () => {
  const plan = buildBaselinePlan(RECORDS, REGISTRY);
  const mu = plan.entries.find((e) => e.exercise === "Muscle-up")!;
  assert.equal(mu.exercise_id, 2);
  assert.ok(!plan.newExercises.some((n) => n.canonical_name === "Muscle-up"));
});

test("planner: unknown exercise is flagged new with metadata", () => {
  const plan = buildBaselinePlan(RECORDS, REGISTRY);
  const nw = plan.newExercises.find((n) => n.canonical_name === "Two-handed KB deadlift")!;
  assert.ok(nw);
  assert.equal(nw.default_load_type, "external");
  assert.equal(nw.primary_metric, "reps");
  assert.deepEqual(nw.aliases, ["kb deadlift"]);
});

test("planner: distinct dates become sessions; same date shares one", () => {
  const plan = buildBaselinePlan(RECORDS, REGISTRY);
  assert.deepEqual([...plan.dates].sort(), ["2026-03-28", "2026-03-29"]);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /Users/julien/Documents/claude/workout-app && npm test`
Expected: FAIL — `Cannot find module '../src/db/baseline-plan'`.

- [ ] **Step 3: Implement the planner**

```typescript
// src/db/baseline-plan.ts
import { matchExercise, type ExerciseRow } from "../lib/exercises";
import type { PrBaseline } from "./pr-baseline-data";

export interface NewExercise {
  canonical_name: string;
  aliases: string[];
  primary_metric: "reps" | "seconds" | "meters";
  default_load_type: "added" | "assisted" | "external" | "bodyweight";
}
export interface PlanEntry {
  exercise: string;
  exercise_id: number | null; // null => one of newExercises (resolved at run time)
  date: string;
  load_type: PrBaseline["load_type"];
  load_value: number | null;
  metric_type: "reps" | "seconds" | "meters";
  metric_value: number;
  per_side: boolean;
}
export interface BaselinePlan {
  newExercises: NewExercise[];
  entries: PlanEntry[];
  dates: Set<string>;
}

export function buildBaselinePlan(records: PrBaseline[], registry: ExerciseRow[]): BaselinePlan {
  const newExercises: NewExercise[] = [];
  const entries: PlanEntry[] = [];
  const dates = new Set<string>();
  const newByName = new Map<string, NewExercise>();

  for (const r of records) {
    const metric_type = r.metric_type ?? "reps";
    const m = matchExercise(r.exercise, registry);
    // Only trust exact/alias. Fuzzy/needs_confirmation => treat as a new exercise,
    // so a near-name never silently binds to the wrong canonical lift.
    const matched = m.resolution === "exact" || m.resolution === "alias";
    if (!matched && !newByName.has(r.exercise)) {
      const ne: NewExercise = {
        canonical_name: r.exercise,
        aliases: r.aliases ?? [],
        primary_metric: metric_type,
        default_load_type: r.load_type,
      };
      newByName.set(r.exercise, ne);
      newExercises.push(ne);
    }
    entries.push({
      exercise: r.exercise,
      exercise_id: matched ? m.exercise_id : null,
      date: r.date,
      load_type: r.load_type,
      load_value: r.load_value,
      metric_type,
      metric_value: r.metric_value,
      per_side: r.per_side ?? false,
    });
    dates.add(r.date);
  }
  return { newExercises, entries, dates };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd /Users/julien/Documents/claude/workout-app && npm test`
Expected: all baseline-plan tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/db/baseline-plan.ts tests/baseline-plan.test.ts
git commit -m "feat: pure baseline planner (match-or-create, group by date)"
```

---

### Task 3: Migration runner + execute against Neon

**Files:**
- Create: `src/db/migrate-prs.ts`
- Modify: `package.json` (add `db:migrate-prs` script)

- [ ] **Step 1: Write the runner**

```typescript
// src/db/migrate-prs.ts
import { sql } from "./client";
import { type ExerciseRow } from "../lib/exercises";
import { PR_BASELINE } from "./pr-baseline-data";
import { buildBaselinePlan } from "./baseline-plan";

async function main() {
  const registry = (await sql`select id, canonical_name, aliases from exercise`) as unknown as ExerciseRow[];
  const plan = buildBaselinePlan(PR_BASELINE, registry);

  // 1. Create new exercises, collecting their ids into a name->id map.
  const idByName = new Map<string, number>();
  for (const e of registry) idByName.set(e.canonical_name, e.id);
  for (const ne of plan.newExercises) {
    const [row] = await sql`
      insert into exercise (canonical_name, aliases, primary_metric, default_load_type, is_key)
      values (${ne.canonical_name}, ${ne.aliases}, ${ne.primary_metric}, ${ne.default_load_type}, false)
      on conflict (canonical_name) do update set aliases = excluded.aliases
      returning id
    `;
    idByName.set(ne.canonical_name, row.id as number);
  }
  console.log(`new exercises created/ensured: ${plan.newExercises.length}`);

  // 2. Baseline session per date (idempotent: look up by date + marker note).
  const NOTE = "PR baseline import";
  const sessionByDate = new Map<string, number>();
  for (const date of plan.dates) {
    const [existing] = await sql`select id from session where date = ${date} and notes = ${NOTE} limit 1`;
    if (existing) { sessionByDate.set(date, existing.id as number); continue; }
    const [row] = await sql`
      insert into session (date, region, type, notes) values (${date}, null, null, ${NOTE}) returning id
    `;
    sessionByDate.set(date, row.id as number);
  }
  console.log(`baseline sessions: ${sessionByDate.size}`);

  // 3. Upsert entries (idempotent via unique(session_id, exercise_id)).
  let n = 0;
  for (const e of plan.entries) {
    const exercise_id = e.exercise_id ?? idByName.get(e.exercise)!;
    const session_id = sessionByDate.get(e.date)!;
    await sql`
      insert into entry (session_id, exercise_id, metric_type, metric_value, load_type, load_value, load_unit, per_side, notes)
      values (${session_id}, ${exercise_id}, ${e.metric_type}, ${e.metric_value}, ${e.load_type}, ${e.load_value}, 'kg', ${e.per_side}, ${NOTE})
      on conflict (session_id, exercise_id) do update set
        metric_type = excluded.metric_type, metric_value = excluded.metric_value,
        load_type = excluded.load_type, load_value = excluded.load_value, per_side = excluded.per_side
    `;
    n++;
  }
  console.log(`baseline entries upserted: ${n}`);
  await sql.end();
}
main();
```

- [ ] **Step 2: Add the npm script**

In `package.json` `scripts`, add:
```json
"db:migrate-prs": "tsx --env-file=.env.local src/db/migrate-prs.ts"
```

- [ ] **Step 3: Run the migration against Neon**

Run: `cd /Users/julien/Documents/claude/workout-app && npm run db:migrate-prs`
Expected output:
```
new exercises created/ensured: 21
baseline sessions: <count of distinct dates>
baseline entries upserted: 34
```

- [ ] **Step 4: Verify PRs match the Notion table**

Run: `cd /Users/julien/Documents/claude/workout-app && curl -s "https://project-753tk.vercel.app/api/prs" | npx --yes json | head -40` (or query `select * from v_prs order by canonical_name`).
Expected: Muscle-up `min_assist_load = -25`; Chin-ups `max_added_load = 12`; Dips `max_added_load = 10` and `max_metric = 13`; Pull-ups `max_added_load = 5` and `max_metric = 10`; Push-ups `max_added_load = 15`. Spot-check 3 new exercises (e.g. Two-handed KB deadlift `max_added_load = 32`).

- [ ] **Step 5: Verify re-run is idempotent**

Run the migration a second time. Expected: same counts, no duplicate sessions/entries (confirm with `select count(*) from entry where notes = 'PR baseline import'` — unchanged).

- [ ] **Step 6: Commit**

```bash
git add src/db/migrate-prs.ts package.json
git commit -m "feat: PR baseline migration runner"
```

---

### Task 4: Repoint workout-generator skill

**Files:**
- Modify: `/Users/julien/Documents/claude/workout-generator-updated/SKILL.md`

- [ ] **Step 1: Replace the PR-read source**

In the "Data to fetch before generating" table, change row 3 from:
```
| 3 | PR table | Call **workout-pr-tracker** skill |
```
to:
```
| 3 | PRs | Call the workout MCP connector tool `get_prs` (returns current best load + best metric per exercise) |
```

- [ ] **Step 2: Remove the delegated-skill reference**

Delete the `## Delegated Skills` block:
```
## Delegated Skills
- **workout-pr-tracker** — fetches current PRs and handles post-workout PR updates
```

- [ ] **Step 3: Repoint REGENERATE PR re-check**

In `## REGENERATE`, change:
```
3. Re-check PRs for any new exercises (via workout-pr-tracker)
```
to:
```
3. Re-check PRs for any new exercises (via the `get_prs` MCP tool)
```

- [ ] **Step 4: Repoint post-workout logging**

In `## LOG SESSION`, replace the final batch-write bullet:
```
- **Batch the writes:** if Julien also pastes results, do the log append and the PR update (via workout-pr-tracker, reusing the in-context PR table) together — minimise round-trips. The log write is the one that must succeed
```
with:
```
- **Results → Neon:** if Julien pastes results, call the workout MCP connector tool `log_workout` (one call, all exercises; summary-per-exercise: best set + load). It writes the actuals and returns per-exercise `is_pr` flags — report which lifts were PRs. There is no separate PR write. Then do the Notion Workout-log append (sets×reps prescription). The `log_workout` call and the Notion log append are independent; the Notion append is the one that gates rotation, the `log_workout` call records progress.
- **Gym-wifi:** if the MCP connector is unavailable, skip `log_workout` and tell Julien results weren't logged to Neon (he can re-log later from phone/Claude Code); never block the session on it.
```

- [ ] **Step 5: Verify no dangling references**

Run: `grep -n "workout-pr-tracker\|PR table\|PR page" "/Users/julien/Documents/claude/workout-generator-updated/SKILL.md"`
Expected: no matches (every reference repointed to `get_prs` / `log_workout`).

- [ ] **Step 6: Commit (if the generator repo is under git; otherwise note the edit)**

```bash
cd /Users/julien/Documents/claude/workout-generator-updated && git add SKILL.md && git commit -m "feat: read PRs via get_prs, log results via log_workout (retire PR table)" 2>/dev/null || echo "not a git repo — edit saved in place"
```

---

### Task 5: Retire the workout-pr-tracker skill

**Files:**
- Delete: `~/.claude/skills/workout-pr-tracker/` (if installed)
- Delete: `/Users/julien/Downloads/workout-pr-tracker.skill`

- [ ] **Step 1: Check whether the skill is installed**

Run: `ls -d ~/.claude/skills/workout-pr-tracker 2>/dev/null && echo INSTALLED || echo "not installed"`

- [ ] **Step 2: Remove the installed skill (only if present)**

Run: `rm -rf ~/.claude/skills/workout-pr-tracker`

- [ ] **Step 3: Remove the source bundle**

Run: `rm -f /Users/julien/Downloads/workout-pr-tracker.skill`

- [ ] **Step 4: Verify removal**

Run: `ls ~/.claude/skills/ | grep -c workout-pr-tracker` → expect `0`. The Notion PR page is intentionally left in place (no deletion).

---

### Task 6: workout-log skill parity check

**Files:**
- Read: `~/.claude/skills/workout-log/SKILL.md`
- Reference: `src/lib/log-workout.ts`, `src/app/api/mcp/route.ts`, `src/app/api/log/route.ts`

- [ ] **Step 1: Confirm both write paths share parse rules**

Verify the `workout-log` SKILL.md parse rules (`+Xkg`→added, `-Xkg`/banded→assisted negative, bare weight on weighted movement→external, BW→bodyweight null, holds→seconds, carries→meters) match the encoding the generator now uses for `log_workout`. They must be identical so a paste produces the same DB write from either door.

- [ ] **Step 2: Confirm MCP `log_workout` and `/api/log` call the same core**

Verify `src/app/api/mcp/route.ts` (`log_workout` tool) and `src/app/api/log/route.ts` both call `logWorkout()` from `src/lib/log-workout.ts` — single write path, no divergent logic.

- [ ] **Step 3: Note any drift**

If the generator's encoding instructions (Task 4) diverge from `workout-log` SKILL.md, align `workout-log` SKILL.md to match. Expected: no change needed (both already follow the same rules). Commit only if an edit was required.

---

### Task 7: Fix inverted assisted-PR aggregate

**Files:**
- Modify: `src/db/schema.sql` (the `v_prs` view)
- Modify: `src/lib/log-workout.ts` (inline PR query)

**Context:** assisted `load_value` is negative; "best" = LEAST assist = closest to 0 = `max(load_value)`. Both the view and the PR-detection query currently use `min(load_value)`, which returns the most-assisted value (wrong). The column name `min_assist_load` reads as "minimum *assistance*" — semantically what we want — so keep the name and only change the aggregate to `max`. No consumer renames needed.

- [ ] **Step 1: Fix the view aggregate**

In `src/db/schema.sql`, change:
```sql
  min(e.load_value)  filter (where e.load_type = 'assisted')           as min_assist_load,
```
to:
```sql
  max(e.load_value)  filter (where e.load_type = 'assisted')           as min_assist_load,
```

- [ ] **Step 2: Re-apply the view to Neon**

Run: `cd /Users/julien/Documents/claude/workout-app && npm run db:schema`
Expected: runs without error (the file uses `create or replace view v_prs`).

- [ ] **Step 3: Fix the PR-detection query**

In `src/lib/log-workout.ts`, change:
```sql
        min(load_value) filter (where load_type = 'assisted') as min_assist,
```
to:
```sql
        max(load_value) filter (where load_type = 'assisted') as min_assist,
```
The comparison `e.load_value > Number(prRow.min_assist)` is already correct once `min_assist` holds the least-assisted value.

- [ ] **Step 4: Verify on Neon**

Run: `cd /Users/julien/Documents/claude/workout-app && curl -s "https://project-753tk.vercel.app/api/prs" | npx --yes json` (after the view is re-applied).
Expected: Muscle-up `min_assist_load = -25` (single imported value; with a future `-20` it would correctly show `-20`).

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.sql src/lib/log-workout.ts
git commit -m "fix: assisted PR = least assist (max load_value), not most"
```

---

### Task 8: Y-axis fix commit + deploy

**Files:**
- Modify: `src/app/components/LadderChart.tsx` (already edited locally: `margin.left` `-8`→`8`, `YAxis width` `46`→`56`)

- [ ] **Step 1: Confirm the local edit is present**

Run: `grep -n "left: 8\|width={56}" src/app/components/LadderChart.tsx`
Expected: both lines present.

- [ ] **Step 2: Build to verify no type/lint errors**

Run: `cd /Users/julien/Documents/claude/workout-app && npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/app/components/LadderChart.tsx
git commit -m "fix: y-axis labels no longer clip (positive left margin + wider gutter)"
```

- [ ] **Step 4: Push (auto-deploys) — only after telling Julien**

This push ships both code changes in this phase (the Task 7 `log-workout.ts` fix and this y-axis fix) and triggers the live deploy (auto-deploy is on). Confirm with Julien first, then:
```bash
git push
```
Expected: push succeeds; Vercel builds master; live in ~1 min. Verify the ladder y-axis labels (`-30kg`…`10kg`) render fully on the live dashboard, now showing the imported baseline.

---

## Resolved decisions
- **Assisted-PR direction** — confirmed inverted (`min` returned most-assisted). Scheduled as **Task 7** (flip to `max(load_value)`, both view and detection query).
- **`-20kg (ORM)` Muscle-up row** — intentionally **not** imported; only the working `-25kg` baseline. Keeps the ladder a working-assist trend without an ORM outlier. Can be added later if desired.

---

## Notes for the executor
- Run everything from `/Users/julien/Documents/claude/workout-app` with `.env.local` present (`DATABASE_URL`).
- Do not push (Task 7 Step 4) without Julien's go — auto-deploy is live.
- After Task 3, today's real session will be logged via `log_workout` as the first end-to-end run (handled in the main session, not part of this plan).
