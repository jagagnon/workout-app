# Workout Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an actuals-only workout tracker (Neon + Next.js) that captures best-set-per-exercise via Claude (MCP on phone, Code skill on laptop) and charts progress, centred on the December muscle-up goal.

**Architecture:** One Next.js 16 app on Vercel over Neon Postgres. A single `logWorkout()` core module (validate → name-match → write → PR-detect) sits behind one HTTP API. Two thin Claude doors (MCP server, Code skill) call that API; a read-only dashboard reads Neon directly. Claude does the parsing, so tool args arrive already structured.

**Tech Stack:** Next.js 16 (App Router), TypeScript, postgres.js (no ORM), Neon Postgres, `mcp-handler` for the MCP route, `recharts` for charts, `node --test` + tsx for unit tests, Playwright for dashboard smoke. Mirrors `crm-app` conventions.

**Spec:** `docs/superpowers/specs/2026-06-12-workout-tracker-design.md`

---

## File structure

```
workout-app/
  package.json
  next.config.ts
  tsconfig.json
  .env.local                      # DATABASE_URL, API_BEARER_TOKEN  (gitignored)
  .env.local.example
  src/
    db/
      client.ts                   # postgres.js singleton
      schema.sql                  # tables + v_prs view
      seed-exercises.ts           # canonical registry seed from existing log
    lib/
      load.ts                     # load-type model + formatLoad()
      exercises.ts                # name-matching (exact/alias/fuzzy/needs_confirmation)
      log-workout.ts              # logWorkout() core
      progress.ts                 # read queries: prs, progression, stalled, ladder, sessions
      auth.ts                     # bearer-token check for write routes
      types.ts                    # shared TS types
    app/
      api/log/route.ts            # POST → logWorkout()
      api/progress/route.ts       # GET → progress queries
      api/prs/route.ts            # GET → v_prs
      api/mcp/route.ts            # MCP server (log_workout, get_progress, get_prs)
      page.tsx                    # dashboard home (ladder hero + recent)
      exercise/[id]/page.tsx      # per-exercise progression
      components/                 # LadderChart, ProgressionChart, StalledList, PrBoard
  tests/
    load.test.ts
    exercises.test.ts
    log-workout.test.ts
    progress.test.ts
    api-log.test.ts
    dashboard.spec.ts             # Playwright
  skill/
    workout-log/SKILL.md          # copied to ~/.claude/skills/ at the end
```

---

## Phase 0 — Scaffold & Neon

### Task 1: Scaffold the Next.js app

**Files:** Create `package.json`, `next.config.ts`, `tsconfig.json`, `.gitignore`, `.env.local.example`

- [ ] **Step 1: Create the Next.js app in place**

Run from `/Users/julien/Documents/claude/workout-app`:
```bash
npx create-next-app@latest . --typescript --app --no-tailwind --no-src-dir --eslint --use-npm --yes
```
(If it refuses because the dir is non-empty due to `docs/`/`.git`, scaffold in a temp dir and copy: `npx create-next-app@latest /tmp/wa --typescript --app --no-tailwind --no-src-dir --eslint --use-npm --yes && cp -r /tmp/wa/. .` then remove the temp.)

- [ ] **Step 2: Move to a `src/` layout and install deps**

```bash
mkdir -p src && git mv app src/app 2>/dev/null || mv app src/app
npm i postgres mcp-handler recharts
npm i -D tsx playwright @types/node
```

- [ ] **Step 3: Add scripts to `package.json`**

Set the `scripts` block to:
```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "test": "node --import tsx --test tests/*.test.ts",
  "db:schema": "psql \"$DATABASE_URL\" -f src/db/schema.sql",
  "db:seed": "tsx --env-file=.env.local src/db/seed-exercises.ts"
}
```

- [ ] **Step 4: Create `.env.local.example`**

```bash
cat > .env.local.example <<'EOF'
DATABASE_URL=postgres://USER:PASSWORD@HOST/db?sslmode=require
API_BEARER_TOKEN=generate-a-long-random-string
EOF
```

- [ ] **Step 5: Ensure `.env.local` is gitignored, then commit**

```bash
grep -q '.env.local' .gitignore || echo '.env.local' >> .gitignore
git add -A && git commit -m "chore: scaffold workout-app (Next.js + deps)"
```

### Task 2: Provision Neon and connect

**Files:** Create `src/db/client.ts`, `.env.local`

- [ ] **Step 1: Provision Neon Postgres**

Use the Vercel Marketplace (Neon) for the linked project, or create a Neon project directly. Copy the pooled connection string into `.env.local`:
```bash
cp .env.local.example .env.local
# edit DATABASE_URL with the Neon string; set API_BEARER_TOKEN:
# API_BEARER_TOKEN=$(openssl rand -hex 32)
```

- [ ] **Step 2: Create the postgres.js client (mirrors crm-app)**

`src/db/client.ts`:
```typescript
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

export const sql = postgres(url, { ssl: "require" });
```

- [ ] **Step 3: Verify connectivity**

Run: `tsx --env-file=.env.local -e "import('./src/db/client.ts').then(async ({sql})=>{console.log(await sql\`select 1 as ok\`); process.exit(0)})"`
Expected: `[ { ok: 1 } ]`

- [ ] **Step 4: Commit**

```bash
git add src/db/client.ts .env.local.example && git commit -m "feat: neon client"
```

---

## Phase 1 — Schema

### Task 3: Schema and PRs view

**Files:** Create `src/db/schema.sql`

- [ ] **Step 1: Write `src/db/schema.sql`**

```sql
create table if not exists exercise (
  id              serial primary key,
  canonical_name  text not null unique,
  aliases         text[] not null default '{}',
  primary_metric  text not null default 'reps'
                    check (primary_metric in ('reps','seconds','meters')),
  default_load_type text not null default 'bodyweight'
                    check (default_load_type in ('added','assisted','external','bodyweight')),
  created_at      timestamptz not null default now()
);

create table if not exists session (
  id         serial primary key,
  date       date not null,
  region     text check (region in ('U','L')),
  type       text check (type in ('Strength','Hypertrophy','Volume')),
  notes      text,
  created_at timestamptz not null default now(),
  unique (date, region)
);

create table if not exists entry (
  id           serial primary key,
  session_id   integer not null references session(id) on delete cascade,
  exercise_id  integer not null references exercise(id),
  metric_type  text not null default 'reps'
                 check (metric_type in ('reps','seconds','meters')),
  metric_value numeric not null,
  load_type    text not null
                 check (load_type in ('added','assisted','external','bodyweight')),
  load_value   numeric,
  load_unit    text not null default 'kg',
  per_side     boolean not null default false,
  notes        text,
  created_at   timestamptz not null default now(),
  unique (session_id, exercise_id)
);

create index if not exists entry_exercise_created on entry (exercise_id, created_at);
create index if not exists session_date on session (date);

-- PRs derived live: best load and best metric per exercise.
create or replace view v_prs as
select
  e.exercise_id,
  x.canonical_name,
  max(e.load_value)  filter (where e.load_type in ('added','external')) as max_added_load,
  min(e.load_value)  filter (where e.load_type = 'assisted')           as min_assist_load,
  max(e.metric_value)                                                   as max_metric
from entry e
join exercise x on x.id = e.exercise_id
group by e.exercise_id, x.canonical_name;
```

- [ ] **Step 2: Apply the schema**

Run: `npm run db:schema`
Expected: `CREATE TABLE` / `CREATE VIEW` output, no errors.

- [ ] **Step 3: Commit**

```bash
git add src/db/schema.sql && git commit -m "feat: schema + v_prs view"
```

### Task 4: Seed the exercise registry

**Files:** Create `src/db/seed-exercises.ts`

- [ ] **Step 1: Write the seed (canonical names + aliases drawn from the existing Notion log)**

`src/db/seed-exercises.ts`:
```typescript
import { sql } from "./client";

// canonical_name, aliases, primary_metric, default_load_type
const EXERCISES: [string, string[], "reps" | "seconds" | "meters", string][] = [
  ["Muscle-up", ["muscle up", "mu", "bar muscle-up", "ring muscle-up"], "reps", "assisted"],
  ["Pull-ups", ["pull up", "pullup", "pull-up"], "reps", "bodyweight"],
  ["Chin-ups", ["chin up", "chins", "weighted chin-ups", "chinup"], "reps", "bodyweight"],
  ["Dips", ["dip", "weighted dips", "ring dips", "russian dips"], "reps", "bodyweight"],
  ["Push-ups", ["push up", "pushup", "press-up"], "reps", "bodyweight"],
  ["Inverted rows", ["inverted row", "bodyweight row"], "reps", "bodyweight"],
  ["Straight-arm pulldown", ["straight arm pulldown"], "reps", "external"],
  ["Kneeling KB press", ["kneeling kettlebell press", "kb press"], "reps", "external"],
  ["Single-arm landmine press", ["landmine press"], "reps", "external"],
  ["L-sit hold", ["l sit", "l-sit"], "seconds", "bodyweight"],
  ["Front lever tuck hold", ["front lever tuck", "tuck front lever"], "seconds", "bodyweight"],
  ["Hollow body hold", ["hollow hold", "hollow body"], "seconds", "bodyweight"],
  ["Single-arm farmer's carry", ["farmers carry", "farmer carry"], "meters", "external"],
  ["Bulgarian split squat", ["bss", "split squat"], "reps", "external"],
  ["Single leg RDL", ["sl rdl", "single-leg rdl"], "reps", "external"],
  ["Goblet cossack squat", ["cossack squat", "goblet cossack"], "reps", "external"],
];

async function main() {
  for (const [name, aliases, metric, loadType] of EXERCISES) {
    await sql`
      insert into exercise (canonical_name, aliases, primary_metric, default_load_type)
      values (${name}, ${aliases}, ${metric}, ${loadType})
      on conflict (canonical_name) do update
        set aliases = excluded.aliases,
            primary_metric = excluded.primary_metric,
            default_load_type = excluded.default_load_type
    `;
  }
  console.log(`Seeded ${EXERCISES.length} exercises`);
  await sql.end();
}
main();
```

- [ ] **Step 2: Run the seed**

Run: `npm run db:seed`
Expected: `Seeded 16 exercises`

- [ ] **Step 3: Commit**

```bash
git add src/db/seed-exercises.ts && git commit -m "feat: seed exercise registry"
```

---

## Phase 2 — Core logic (TDD)

### Task 5: Shared types

**Files:** Create `src/lib/types.ts`

- [ ] **Step 1: Write the types**

```typescript
export type LoadType = "added" | "assisted" | "external" | "bodyweight";
export type MetricType = "reps" | "seconds" | "meters";

export interface EntryInput {
  exercise: string;
  metric: number;
  metric_type?: MetricType;
  load_type: LoadType;
  load_value?: number | null;
  load_unit?: string;
  per_side?: boolean;
  notes?: string;
}

export interface LogInput {
  date?: string;            // YYYY-MM-DD, defaults to today (Europe/Zurich)
  region?: "U" | "L";
  type?: "Strength" | "Hypertrophy" | "Volume";
  entries: EntryInput[];
}

export interface ResolvedEntry {
  input: EntryInput;
  exercise_id: number | null;     // null when unmatched
  canonical_name: string | null;
  resolution: "exact" | "alias" | "fuzzy" | "needs_confirmation";
  candidates?: string[];          // for needs_confirmation / fuzzy
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/types.ts && git commit -m "feat: shared types"
```

### Task 6: Load model + formatting

**Files:** Create `src/lib/load.ts`, `tests/load.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/load.test.ts`:
```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatLoad } from "../src/lib/load";

test("added load shows +kg", () => {
  assert.equal(formatLoad("added", 10, "kg", false), "+10kg");
});
test("assisted load shows -kg", () => {
  assert.equal(formatLoad("assisted", -25, "kg", false), "-25kg");
});
test("external load shows bare kg", () => {
  assert.equal(formatLoad("external", 16, "kg", false), "16kg");
});
test("bodyweight shows BW", () => {
  assert.equal(formatLoad("bodyweight", null, "kg", false), "BW");
});
test("per_side appends /side", () => {
  assert.equal(formatLoad("external", 12, "kg", true), "12kg/side");
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test -- tests/load.test.ts` (or `node --import tsx --test tests/load.test.ts`)
Expected: FAIL — `formatLoad` not found.

- [ ] **Step 3: Implement `src/lib/load.ts`**

```typescript
import type { LoadType } from "./types";

export function formatLoad(
  loadType: LoadType,
  value: number | null | undefined,
  unit = "kg",
  perSide = false,
): string {
  let base: string;
  if (loadType === "bodyweight" || value == null) base = "BW";
  else if (loadType === "added") base = `+${value}${unit}`;
  else if (loadType === "assisted") base = `${value}${unit}`; // value is negative
  else base = `${value}${unit}`; // external
  return perSide && base !== "BW" ? `${base}/side` : base;
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `node --import tsx --test tests/load.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/load.ts tests/load.test.ts && git commit -m "feat: load model + formatLoad"
```

### Task 7: Exercise name-matching

**Files:** Create `src/lib/exercises.ts`, `tests/exercises.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/exercises.test.ts`:
```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { matchExercise, type ExerciseRow } from "../src/lib/exercises";

const REGISTRY: ExerciseRow[] = [
  { id: 1, canonical_name: "Chin-ups", aliases: ["chins", "weighted chin-ups"] },
  { id: 2, canonical_name: "Muscle-up", aliases: ["muscle up", "mu"] },
  { id: 3, canonical_name: "Dips", aliases: ["dip"] },
];

test("exact canonical match", () => {
  const r = matchExercise("Chin-ups", REGISTRY);
  assert.equal(r.exercise_id, 1);
  assert.equal(r.resolution, "exact");
});
test("alias match is case-insensitive", () => {
  const r = matchExercise("CHINS", REGISTRY);
  assert.equal(r.exercise_id, 1);
  assert.equal(r.resolution, "alias");
});
test("close fuzzy match resolves but flags fuzzy", () => {
  const r = matchExercise("chin up", REGISTRY); // not an exact alias
  assert.equal(r.exercise_id, 1);
  assert.equal(r.resolution, "fuzzy");
});
test("no confident match → needs_confirmation with candidates", () => {
  const r = matchExercise("zercher squat", REGISTRY);
  assert.equal(r.exercise_id, null);
  assert.equal(r.resolution, "needs_confirmation");
  assert.ok(Array.isArray(r.candidates));
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `node --import tsx --test tests/exercises.test.ts`
Expected: FAIL — `matchExercise` not found.

- [ ] **Step 3: Implement `src/lib/exercises.ts`**

```typescript
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

// Levenshtein, small-string use.
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
  // fuzzy: nearest by normalized edit distance over canonical + aliases
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
```

- [ ] **Step 4: Run test, verify it passes**

Run: `node --import tsx --test tests/exercises.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/exercises.ts tests/exercises.test.ts && git commit -m "feat: exercise name-matching"
```

### Task 8: `logWorkout()` core + PR detection

**Files:** Create `src/lib/log-workout.ts`, `tests/log-workout.test.ts`

- [ ] **Step 1: Write the failing test** (uses the live DB; assumes schema applied + registry seeded)

`tests/log-workout.test.ts`:
```typescript
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { sql } from "../src/db/client";
import { logWorkout } from "../src/lib/log-workout";

before(async () => {
  await sql`delete from entry where session_id in (select id from session where date = '2099-01-01')`;
  await sql`delete from session where date = '2099-01-01'`;
});
after(async () => {
  await sql`delete from entry where session_id in (select id from session where date = '2099-01-01')`;
  await sql`delete from session where date = '2099-01-01'`;
  await sql.end();
});

test("logs a session and returns PR for first-ever load", async () => {
  const res = await logWorkout({
    date: "2099-01-01", region: "U", type: "Strength",
    entries: [{ exercise: "Chin-ups", metric: 5, load_type: "added", load_value: 10 }],
  });
  const chin = res.results.find((r) => r.canonical_name === "Chin-ups")!;
  assert.equal(chin.resolution, "exact");
  assert.equal(chin.is_pr, true);
});

test("re-logging same exercise same day overwrites (idempotent)", async () => {
  await logWorkout({ date: "2099-01-01", region: "U",
    entries: [{ exercise: "Chin-ups", metric: 6, load_type: "added", load_value: 10 }] });
  const rows = await sql`
    select e.metric_value from entry e
    join session s on s.id = e.session_id
    where s.date = '2099-01-01' and e.exercise_id = (select id from exercise where canonical_name='Chin-ups')`;
  assert.equal(rows.length, 1);
  assert.equal(Number(rows[0].metric_value), 6);
});

test("unmatched exercise returns needs_confirmation and is NOT written", async () => {
  const res = await logWorkout({ date: "2099-01-01", region: "U",
    entries: [{ exercise: "zercher squat", metric: 8, load_type: "external", load_value: 40 }] });
  const z = res.results.find((r) => r.input.exercise === "zercher squat")!;
  assert.equal(z.resolution, "needs_confirmation");
  assert.equal(z.written, false);
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `node --import tsx --test tests/log-workout.test.ts`
Expected: FAIL — `logWorkout` not found.

- [ ] **Step 3: Implement `src/lib/log-workout.ts`**

```typescript
import { sql } from "../db/client";
import { matchExercise, type ExerciseRow } from "./exercises";
import { formatLoad } from "./load";
import type { LogInput } from "./types";

function todayZurich(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date()); // en-CA → YYYY-MM-DD
}

export interface EntryResult {
  input: LogInput["entries"][number];
  exercise_id: number | null;
  canonical_name: string | null;
  resolution: string;
  candidates?: string[];
  written: boolean;
  is_pr: boolean;
  display: string;        // e.g. "Chin-ups 5 @ +10kg"
}
export interface LogResult {
  date: string;
  session_id: number | null;
  results: EntryResult[];
}

export async function logWorkout(input: LogInput): Promise<LogResult> {
  const date = input.date ?? todayZurich();
  const registry = (await sql`
    select id, canonical_name, aliases from exercise
  `) as unknown as ExerciseRow[];

  // upsert session
  const [sessionRow] = await sql`
    insert into session (date, region, type, notes)
    values (${date}, ${input.region ?? null}, ${input.type ?? null}, ${null})
    on conflict (date, region) do update set type = coalesce(excluded.type, session.type)
    returning id
  `;
  const session_id = sessionRow.id as number;

  const results: EntryResult[] = [];
  for (const e of input.entries) {
    const m = matchExercise(e.exercise, registry);
    if (m.exercise_id == null) {
      results.push({
        input: e, exercise_id: null, canonical_name: null, resolution: m.resolution,
        candidates: m.candidates, written: false, is_pr: false,
        display: `${e.exercise} (unmatched)`,
      });
      continue;
    }

    // PR check BEFORE writing this entry
    const [prRow] = await sql`
      select
        max(load_value) filter (where load_type in ('added','external')) as max_added,
        min(load_value) filter (where load_type = 'assisted') as min_assist,
        max(metric_value) as max_metric
      from entry where exercise_id = ${m.exercise_id}
    `;
    const isPr =
      (e.load_type === "added" || e.load_type === "external")
        ? e.load_value != null && (prRow.max_added == null || e.load_value > Number(prRow.max_added))
      : e.load_type === "assisted"
        ? e.load_value != null && (prRow.min_assist == null || e.load_value > Number(prRow.min_assist))
      : (prRow.max_metric == null || e.metric > Number(prRow.max_metric));

    await sql`
      insert into entry (session_id, exercise_id, metric_type, metric_value,
                         load_type, load_value, load_unit, per_side, notes)
      values (${session_id}, ${m.exercise_id}, ${e.metric_type ?? "reps"}, ${e.metric},
              ${e.load_type}, ${e.load_value ?? null}, ${e.load_unit ?? "kg"},
              ${e.per_side ?? false}, ${e.notes ?? null})
      on conflict (session_id, exercise_id) do update set
        metric_type = excluded.metric_type, metric_value = excluded.metric_value,
        load_type = excluded.load_type, load_value = excluded.load_value,
        load_unit = excluded.load_unit, per_side = excluded.per_side, notes = excluded.notes
    `;

    results.push({
      input: e, exercise_id: m.exercise_id, canonical_name: m.canonical_name,
      resolution: m.resolution, written: true, is_pr: isPr,
      display: `${m.canonical_name} ${e.metric} @ ${formatLoad(e.load_type, e.load_value, e.load_unit ?? "kg", e.per_side ?? false)}`,
    });
  }

  return { date, session_id, results };
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `node --import tsx --test tests/log-workout.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/log-workout.ts tests/log-workout.test.ts && git commit -m "feat: logWorkout core + PR detection"
```

### Task 9: Read queries (progress, ladder, stalled, PRs, sessions)

**Files:** Create `src/lib/progress.ts`, `tests/progress.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/progress.test.ts`:
```typescript
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { sql } from "../src/db/client";
import { logWorkout } from "../src/lib/log-workout";
import { exerciseProgression, muscleUpLadder, stalledLifts } from "../src/lib/progress";

before(async () => {
  await logWorkout({ date: "2099-02-01", region: "U",
    entries: [{ exercise: "Muscle-up", metric: 3, load_type: "assisted", load_value: -30 }] });
  await logWorkout({ date: "2099-02-03", region: "U",
    entries: [{ exercise: "Muscle-up", metric: 3, load_type: "assisted", load_value: -25 }] });
});
after(async () => {
  await sql`delete from entry where session_id in (select id from session where date in ('2099-02-01','2099-02-03'))`;
  await sql`delete from session where date in ('2099-02-01','2099-02-03')`;
  await sql.end();
});

test("ladder returns assisted load over time, ascending toward zero", async () => {
  const ladder = await muscleUpLadder();
  const pts = ladder.filter((p) => p.date >= "2099-02-01");
  assert.ok(pts.length >= 2);
  assert.ok(Number(pts.at(-1)!.load_value) > Number(pts[0].load_value)); // -25 > -30
});

test("progression returns rows for an exercise", async () => {
  const rows = await exerciseProgression("Muscle-up");
  assert.ok(rows.length >= 2);
});

test("stalledLifts returns an array", async () => {
  const rows = await stalledLifts(3);
  assert.ok(Array.isArray(rows));
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `node --import tsx --test tests/progress.test.ts`
Expected: FAIL — module/exports not found.

- [ ] **Step 3: Implement `src/lib/progress.ts`**

```typescript
import { sql } from "../db/client";

export async function exerciseProgression(canonicalName: string) {
  return sql`
    select s.date, e.metric_value, e.metric_type, e.load_type, e.load_value, e.load_unit, e.per_side
    from entry e
    join session s on s.id = e.session_id
    join exercise x on x.id = e.exercise_id
    where x.canonical_name = ${canonicalName}
    order by s.date asc
  ` as unknown as Array<{ date: string; metric_value: number; load_value: number | null }>;
}

export async function muscleUpLadder() {
  return sql`
    select s.date, e.load_value, e.load_type, e.metric_value
    from entry e
    join session s on s.id = e.session_id
    join exercise x on x.id = e.exercise_id
    where x.canonical_name = 'Muscle-up'
    order by s.date asc
  ` as unknown as Array<{ date: string; load_value: number | null; load_type: string }>;
}

// Stalled: exercises whose best load hasn't improved across their last `n` sessions.
export async function stalledLifts(n = 3) {
  return sql`
    with ranked as (
      select x.canonical_name, s.date, e.load_value, e.load_type,
             row_number() over (partition by e.exercise_id order by s.date desc) as rn
      from entry e
      join session s on s.id = e.session_id
      join exercise x on x.id = e.exercise_id
      where e.load_type in ('added','external')
    )
    select canonical_name,
           max(load_value) as recent_best,
           count(*) as sessions
    from ranked
    where rn <= ${n}
    group by canonical_name
    having count(*) >= ${n}
       and max(load_value) = min(load_value)
  ` as unknown as Array<{ canonical_name: string; recent_best: number; sessions: number }>;
}

export async function prBoard() {
  return sql`select * from v_prs order by canonical_name`
    as unknown as Array<Record<string, unknown>>;
}

export async function recentSessions(limit = 20) {
  return sql`
    select s.id, s.date, s.region, s.type,
           json_agg(json_build_object(
             'exercise', x.canonical_name, 'metric', e.metric_value,
             'load_type', e.load_type, 'load_value', e.load_value, 'unit', e.load_unit
           ) order by e.id) as entries
    from session s
    join entry e on e.session_id = s.id
    join exercise x on x.id = e.exercise_id
    group by s.id
    order by s.date desc
    limit ${limit}
  ` as unknown as Array<Record<string, unknown>>;
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `node --import tsx --test tests/progress.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/progress.ts tests/progress.test.ts && git commit -m "feat: read queries (ladder, progression, stalled, prs, sessions)"
```

---

## Phase 3 — HTTP API + auth

### Task 10: Bearer-token auth

**Files:** Create `src/lib/auth.ts`

- [ ] **Step 1: Write `src/lib/auth.ts`**

```typescript
export function checkBearer(req: Request): boolean {
  const token = process.env.API_BEARER_TOKEN;
  if (!token) return false;
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${token}`;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/auth.ts && git commit -m "feat: bearer auth helper"
```

### Task 11: `POST /api/log` route

**Files:** Create `src/app/api/log/route.ts`, `tests/api-log.test.ts`

- [ ] **Step 1: Write the route**

`src/app/api/log/route.ts`:
```typescript
import { NextResponse } from "next/server";
import { logWorkout } from "../../../lib/log-workout";
import { checkBearer } from "../../../lib/auth";
import type { LogInput } from "../../../lib/types";

export async function POST(req: Request) {
  if (!checkBearer(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: LogInput;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  if (!body?.entries?.length) return NextResponse.json({ error: "no entries" }, { status: 400 });
  const result = await logWorkout(body);
  return NextResponse.json(result);
}
```

- [ ] **Step 2: Write the failing integration test** (runs against `next dev`)

`tests/api-log.test.ts`:
```typescript
import { test } from "node:test";
import assert from "node:assert/strict";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const TOKEN = process.env.API_BEARER_TOKEN!;

test("rejects missing auth", async () => {
  const r = await fetch(`${BASE}/api/log`, { method: "POST", body: "{}" });
  assert.equal(r.status, 401);
});

test("logs a session with auth", async () => {
  const r = await fetch(`${BASE}/api/log`, {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ date: "2099-03-01", region: "U",
      entries: [{ exercise: "Dips", metric: 8, load_type: "added", load_value: 10 }] }),
  });
  assert.equal(r.status, 200);
  const json = await r.json();
  assert.equal(json.results[0].canonical_name, "Dips");
});
```

- [ ] **Step 3: Start dev server and run test**

```bash
npm run dev &          # in another shell, or use `next dev` background
sleep 4
node --import tsx --env-file=.env.local --test tests/api-log.test.ts
```
Expected: PASS (2 tests). Then stop the dev server.

- [ ] **Step 4: Clean up test data and commit**

```bash
psql "$DATABASE_URL" -c "delete from entry where session_id in (select id from session where date='2099-03-01'); delete from session where date='2099-03-01';"
git add src/app/api/log/route.ts tests/api-log.test.ts && git commit -m "feat: POST /api/log"
```

### Task 12: Read API routes

**Files:** Create `src/app/api/progress/route.ts`, `src/app/api/prs/route.ts`

- [ ] **Step 1: Write `src/app/api/progress/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { exerciseProgression, muscleUpLadder, stalledLifts } from "../../../lib/progress";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const exercise = url.searchParams.get("exercise");
  if (exercise) return NextResponse.json(await exerciseProgression(exercise));
  if (url.searchParams.get("ladder") === "1") return NextResponse.json(await muscleUpLadder());
  if (url.searchParams.get("stalled") === "1") return NextResponse.json(await stalledLifts());
  return NextResponse.json({ error: "specify ?exercise= | ?ladder=1 | ?stalled=1" }, { status: 400 });
}
```

- [ ] **Step 2: Write `src/app/api/prs/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { prBoard } from "../../../lib/progress";

export async function GET() {
  return NextResponse.json(await prBoard());
}
```

- [ ] **Step 3: Smoke-check both (dev server running)**

```bash
curl -s "http://localhost:3000/api/progress?ladder=1" | head
curl -s "http://localhost:3000/api/prs" | head
```
Expected: JSON arrays (200).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/progress/route.ts src/app/api/prs/route.ts && git commit -m "feat: read API routes"
```

---

## Phase 4 — MCP server (phone door)

### Task 13: MCP route with `log_workout`, `get_progress`, `get_prs`

**Files:** Create `src/app/api/mcp/route.ts`

> **Verify-at-build (from spec):** before wiring auth, confirm the current Claude.ai custom-connector
> auth contract against Anthropic connector docs (consult the `claude-api` reference). The tool
> definitions below do not change; only the auth wrapper may. Start with the token guard shown,
> then layer OAuth per current docs.

- [ ] **Step 1: Write the MCP route using `mcp-handler`**

`src/app/api/mcp/route.ts`:
```typescript
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { logWorkout } from "../../../lib/log-workout";
import { exerciseProgression, muscleUpLadder, prBoard } from "../../../lib/progress";
import { formatLoad } from "../../../lib/load";

const entrySchema = z.object({
  exercise: z.string(),
  metric: z.number(),
  metric_type: z.enum(["reps", "seconds", "meters"]).optional(),
  load_type: z.enum(["added", "assisted", "external", "bodyweight"]),
  load_value: z.number().nullable().optional(),
  load_unit: z.string().optional(),
  per_side: z.boolean().optional(),
  notes: z.string().optional(),
});

const handler = createMcpHandler((server) => {
  server.tool(
    "log_workout",
    "Log a training session's best-set-per-exercise actuals.",
    {
      date: z.string().optional(),
      region: z.enum(["U", "L"]).optional(),
      type: z.enum(["Strength", "Hypertrophy", "Volume"]).optional(),
      entries: z.array(entrySchema),
    },
    async (args) => {
      const res = await logWorkout(args);
      const lines = res.results.map((r) =>
        r.written
          ? `• ${r.display}${r.is_pr ? "  ⬆ PR" : ""}`
          : `⚠ '${r.input.exercise}' unmatched — candidates: ${(r.candidates ?? []).join(", ")}`,
      );
      return { content: [{ type: "text", text: `Logged ${res.date}\n${lines.join("\n")}` }] };
    },
  );

  server.tool(
    "get_progress",
    "Get progression for one exercise, or the muscle-up ladder.",
    { exercise: z.string().optional(), ladder: z.boolean().optional() },
    async ({ exercise, ladder }) => {
      const data = ladder ? await muscleUpLadder() : await exerciseProgression(exercise ?? "");
      return { content: [{ type: "text", text: JSON.stringify(data) }] };
    },
  );

  server.tool("get_prs", "Get the PR board.", {}, async () => {
    return { content: [{ type: "text", text: JSON.stringify(await prBoard()) }] };
  });
});

export { handler as GET, handler as POST };
```

- [ ] **Step 2: Verify the MCP endpoint responds**

```bash
curl -s -X POST http://localhost:3000/api/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | head
```
Expected: JSON listing `log_workout`, `get_progress`, `get_prs`.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/mcp/route.ts && git commit -m "feat: MCP server (log_workout, get_progress, get_prs)"
```

### Task 14: Deploy + connect the phone

**Files:** none (configuration)

- [ ] **Step 1: Deploy to Vercel and set env**

```bash
vercel link
vercel env add DATABASE_URL production
vercel env add API_BEARER_TOKEN production
vercel deploy --prod
```

- [ ] **Step 2: Add the connector in the Claude app**

In Claude (web/mobile) → Settings → Connectors → add custom connector with URL `https://<deploy>/api/mcp`. Complete the auth flow per current connector docs (OAuth or token, per the verify-at-build step).

- [ ] **Step 3: Smoke test from the phone**

In the Claude app: "log workout: muscle-up best 3 at minus 25, chin-ups best 5 plus 10". Confirm the reply shows the logged lines and any PR/ladder note, and that the rows appear via `curl .../api/prs`.

---

## Phase 5 — Claude Code skill (laptop door)

### Task 15: `workout-log` skill

**Files:** Create `skill/workout-log/SKILL.md`

- [ ] **Step 1: Write the skill**

`skill/workout-log/SKILL.md`:
```markdown
---
name: workout-log
description: >
  Log Julien's training actuals and review progress. Use when he says "log workout",
  "log my session", pastes a session dump, or asks "how am I trending / am I stalling /
  muscle-up progress". Parses his dump into structured entries and POSTs to the workout app.
---

# Workout Log Skill

## Endpoint
- Base URL: read `WORKOUT_API_URL` (e.g. `https://<deploy>`); token: `WORKOUT_API_TOKEN`.
- Both live in `~/.claude/skills/workout-log/.env` (gitignored).

## Logging a session
1. Parse Julien's dump into entries. Each exercise → `{exercise, metric, metric_type?,
   load_type, load_value?, per_side?}`.
   - `+Xkg` → load_type `added`, load_value `X`.
   - `-Xkg` / "banded"/"assisted" → load_type `assisted`, load_value `-X`.
   - bare weight on a weighted movement (goblet/KB/landmine) → `external`, load_value `X`.
   - bodyweight / "BW" → `bodyweight`, load_value null.
   - holds in seconds → metric_type `seconds`; carries in metres → `meters`.
2. POST to `{WORKOUT_API_URL}/api/log` with header `Authorization: Bearer {WORKOUT_API_TOKEN}`.
3. Show Julien the returned per-exercise lines, PR flags, and any `needs_confirmation`
   exercises. **If an exercise is unmatched, ask before re-sending** — never invent one.

## Reviewing progress
- Trend for a lift: `GET /api/progress?exercise=<canonical>`.
- Muscle-up ladder: `GET /api/progress?ladder=1`.
- Stalled lifts: `GET /api/progress?stalled=1`.
- PR board: `GET /api/prs`.

## Rules
- Summary-per-exercise only (best set + load). Do not invent per-set data.
- Confirm before creating a new exercise.
```

- [ ] **Step 2: Install the skill and its env**

```bash
mkdir -p ~/.claude/skills/workout-log
cp skill/workout-log/SKILL.md ~/.claude/skills/workout-log/SKILL.md
printf 'WORKOUT_API_URL=https://<deploy>\nWORKOUT_API_TOKEN=<token>\n' > ~/.claude/skills/workout-log/.env
echo ".env" > ~/.claude/skills/workout-log/.gitignore
```

- [ ] **Step 3: Smoke test from a fresh Claude Code session**

Say: "log my session: dips best 8 +10, pull-ups best 6 BW". Confirm it POSTs and reports the result. Then "muscle-up progress" → confirm it GETs the ladder.

- [ ] **Step 4: Commit**

```bash
git add skill/workout-log/SKILL.md && git commit -m "feat: workout-log Claude Code skill"
```

---

## Phase 6 — Dashboard

### Task 16: Ladder + progression chart components

**Files:** Create `src/app/components/LadderChart.tsx`, `src/app/components/ProgressionChart.tsx`

- [ ] **Step 1: Write `LadderChart.tsx`** (client component, recharts)

```tsx
"use client";
import { LineChart, Line, XAxis, YAxis, ReferenceLine, Tooltip, ResponsiveContainer } from "recharts";

export function LadderChart({ data }: { data: { date: string; load_value: number | null }[] }) {
  const pts = data.filter((d) => d.load_value != null);
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={pts} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <ReferenceLine y={0} stroke="#888" strokeDasharray="4 4" label="bodyweight" />
        <Tooltip />
        <Line type="monotone" dataKey="load_value" stroke="#e0245e" strokeWidth={2} dot />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 2: Write `ProgressionChart.tsx`**

```tsx
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
```

- [ ] **Step 3: Commit**

```bash
git add src/app/components/LadderChart.tsx src/app/components/ProgressionChart.tsx && git commit -m "feat: chart components"
```

### Task 17: Dashboard home (ladder hero + stalled + PR board + recent)

**Files:** Modify `src/app/page.tsx`; create `src/app/components/StalledList.tsx`, `src/app/components/PrBoard.tsx`

- [ ] **Step 1: Write `StalledList.tsx` and `PrBoard.tsx`** (server-rendered tables)

`src/app/components/StalledList.tsx`:
```tsx
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
```

`src/app/components/PrBoard.tsx`:
```tsx
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
```

- [ ] **Step 2: Write `src/app/page.tsx`** (server component, reads Neon directly)

```tsx
import { muscleUpLadder, stalledLifts, prBoard, recentSessions } from "../lib/progress";
import { LadderChart } from "./components/LadderChart";
import { StalledList } from "./components/StalledList";
import { PrBoard } from "./components/PrBoard";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [ladder, stalled, prs, sessions] = await Promise.all([
    muscleUpLadder(), stalledLifts(), prBoard(), recentSessions(10),
  ]);
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 16, fontFamily: "system-ui" }}>
      <h1>Muscle-up ladder</h1>
      <LadderChart data={ladder as any} />
      <h2>Stalled lifts</h2>
      <StalledList rows={stalled as any} />
      <h2>PR board</h2>
      <PrBoard rows={prs as any} />
      <h2>Recent sessions</h2>
      <ul>
        {(sessions as any[]).map((s) => (
          <li key={s.id}>{s.date} {s.region ?? ""} {s.type ?? ""} — {(s.entries as any[]).length} exercises</li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 3: Write `src/app/exercise/[id]/page.tsx`** (per-exercise progression by canonical name)

```tsx
import { exerciseProgression } from "../../../lib/progress";
import { ProgressionChart } from "../../components/ProgressionChart";

export const dynamic = "force-dynamic";

export default async function ExercisePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const name = decodeURIComponent(id);
  const data = await exerciseProgression(name);
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 16, fontFamily: "system-ui" }}>
      <h1>{name}</h1>
      <ProgressionChart data={data as any} />
    </main>
  );
}
```

- [ ] **Step 4: Visual check**

Run `npm run dev`, open `http://localhost:3000` and `http://localhost:3000/exercise/Muscle-up`.
Expected: ladder renders, stalled/PR/recent sections render from seeded + test data.

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx src/app/exercise src/app/components/StalledList.tsx src/app/components/PrBoard.tsx && git commit -m "feat: dashboard home + exercise progression"
```

### Task 18: Dashboard smoke test (Playwright)

**Files:** Create `tests/dashboard.spec.ts`, `playwright.config.ts`

- [ ] **Step 1: Write `playwright.config.ts`**

```typescript
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests",
  testMatch: "**/*.spec.ts",
  use: { baseURL: "http://localhost:3000" },
  webServer: { command: "npm run dev", url: "http://localhost:3000", reuseExistingServer: true },
});
```

- [ ] **Step 2: Write `tests/dashboard.spec.ts`**

```typescript
import { test, expect } from "@playwright/test";

test("home renders ladder and sections", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Muscle-up ladder" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "PR board" })).toBeVisible();
});
```

- [ ] **Step 3: Run it**

Run: `npx playwright test`
Expected: 1 passed.

- [ ] **Step 4: Commit**

```bash
git add tests/dashboard.spec.ts playwright.config.ts && git commit -m "test: dashboard smoke"
```

---

## Phase 7 — Cutover

### Task 19: Backfill recent history & retire Notion log

**Files:** none (data)

- [ ] **Step 1: Backfill via the skill**

Using the `workout-log` skill, replay the most recent ~2–3 weeks of sessions from the Notion
"Workout log" page so the charts have history. Each session → one `log_workout` call. For
exercises not in the seed, confirm-and-create as prompted.

- [ ] **Step 2: Verify the dashboard reflects history**

Open the deployed dashboard: ladder shows the assisted-load trend; PR board matches the
exercises you backfilled.

- [ ] **Step 3: Update the Notion log header**

Add a note at the top of the Notion "Workout log": "Actuals now tracked in the workout app —
this page retained for generation context only." (Do not delete; generator still writes plans here.)

---

## Self-review

**Spec coverage:**
- Actuals-only, summary-per-exercise → Tasks 3, 8 ✓
- Three tables + signed-`assisted` load + `v_prs` view → Task 3 ✓
- Load model (4 types) → Task 6 ✓
- Name-matching with needs_confirmation → Task 7 ✓
- `logWorkout` + idempotent overwrite + PR detection → Task 8 ✓
- Read queries (ladder, progression, stalled, prs, sessions) → Task 9 ✓
- HTTP API + bearer auth → Tasks 10–12 ✓
- MCP server (3 tools) + connector → Tasks 13–14 ✓
- Claude Code skill over HTTP → Task 15 ✓
- Dashboard (ladder hero, progression, stalled, PR board, recent) → Tasks 16–17 ✓
- Tests: core unit + API + Playwright smoke → Tasks 6–9, 11, 18 ✓
- Verify-at-build connector auth flag → Task 13 note ✓
- Retire Notion log as record → Task 19 ✓

**Placeholder scan:** `<deploy>` / `<token>` in Tasks 14–15 are real user-supplied values at
deploy time, not plan gaps. No TODO/TBD logic.

**Type consistency:** `logWorkout(LogInput) → LogResult` (Task 8) is consumed unchanged by the
API route (Task 11) and MCP tool (Task 13). `matchExercise` signature (Task 7) matches its use in
Task 8. `formatLoad` signature (Task 6) matches Task 8/13 usage. Progress query names
(`muscleUpLadder`, `exerciseProgression`, `stalledLifts`, `prBoard`, `recentSessions`) defined in
Task 9 match all consumers (Tasks 12, 13, 17).

**Out of scope (unchanged from spec):** per-set/RPE, server-side parsing, plan storage, wearables,
Telegram/Shortcut doors, multi-user.
