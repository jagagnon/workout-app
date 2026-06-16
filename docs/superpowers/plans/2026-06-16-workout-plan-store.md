# Workout Plan Store — Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retire the Notion Workout log by storing each generated session's plan in a queryable Neon `plan` table the generator writes via `log_plan` and reads (last 4 per region) via `get_recent_plans`.

**Architecture:** A new `plan` table holds `(date, region, stimulus, body)` where `body` is the verbatim `W/A1/…/F` block. Thin lib wrappers (`logPlan`, `recentPlans`) back two new MCP tools. The generator is repointed to read recent plans (last 4 same-region, any stimulus) for stimulus rotation + variety + MU-progression, and to write its plan instead of prepending to Notion. A seed loads the last 4 Upper + 2 Lower sessions so there's no cold start.

**Tech Stack:** TypeScript, postgres.js, `mcp-handler` + zod, `node:test` + `tsx`, Neon, Vercel (auto-deploy on push to master).

**Environment note:** Controller can't run node/tsx/next directly. Subagents run from `/Users/julien/Documents/claude/workout-app` with `.env.local` present; load env via `tsx --env-file=.env.local` or `set -a; source .env.local; set +a` for `npm run db:schema`. The repo test runner (`npm test`) does NOT load env, so DB-dependent checks are done as explicit round-trip steps, not unit tests.

**Branch:** Do all work on a feature branch (`feat/plan-store`); auto-deploy is live on `master`, so merge+push only at the end with user consent.

---

## File Structure
- **Modify** `src/db/schema.sql` — add the `plan` table + index.
- **Create** `src/lib/plans.ts` — `logPlan(input)` and `recentPlans(region, limit)`.
- **Modify** `src/app/api/mcp/route.ts` — add `log_plan` + `get_recent_plans` tools.
- **Create** `src/db/seed-plans.ts` — embedded last-4-Upper + last-2-Lower plans, inserted via `logPlan`.
- **Create** `tests/seed-plans.test.ts` — data-invariant unit test (no DB).
- **Modify** `package.json` — add `db:seed-plans` script.
- **Modify** generator `SKILL.md` (bundle `/tmp/wg-skill/workout-generator/SKILL.md` rebuilt to `/Users/julien/Downloads/workout-generator-updated.skill`, and the synced local copy `/Users/julien/Documents/claude/workout-generator-updated/SKILL.md`) — repoint to plans, update variety rule, retire Notion log.

---

### Task 1: `plan` table + lib

**Files:**
- Modify: `src/db/schema.sql`
- Create: `src/lib/plans.ts`

- [ ] **Step 1: Add the table to `src/db/schema.sql`**

Append at the end of the file:
```sql

create table if not exists plan (
  id         serial primary key,
  date       date not null,
  region     text check (region in ('U','L')),
  stimulus   text check (stimulus in ('Strength','Hypertrophy','Volume')),
  body       text not null,
  created_at timestamptz not null default now(),
  unique (date, region)
);
create index if not exists plan_region_date on plan (region, date desc);
```

- [ ] **Step 2: Apply the schema to Neon**

Run: `set -a; source .env.local; set +a; npm run db:schema`
Expected: runs cleanly; `CREATE TABLE` (or skipped if exists) + `CREATE INDEX`. Non-destructive (`create table if not exists`).

- [ ] **Step 3: Create `src/lib/plans.ts`**

```typescript
import { sql } from "../db/client";

export type Region = "U" | "L";
export type Stimulus = "Strength" | "Hypertrophy" | "Volume";

export interface PlanInput {
  date?: string;
  region: Region;
  stimulus?: Stimulus | null;
  body: string;
}
export interface PlanRow {
  date: string;
  region: string;
  stimulus: string | null;
  body: string;
}

// Local TZ-correct "today" (mirrors log-workout.ts; kept self-contained).
function todayZurich(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

export async function logPlan(input: PlanInput): Promise<PlanRow> {
  const date = input.date ?? todayZurich();
  const [row] = await sql`
    insert into plan (date, region, stimulus, body)
    values (${date}, ${input.region}, ${input.stimulus ?? null}, ${input.body})
    on conflict (date, region) do update set
      stimulus = excluded.stimulus, body = excluded.body
    returning date, region, stimulus, body
  `;
  return row as unknown as PlanRow;
}

export async function recentPlans(region: Region, limit = 4): Promise<PlanRow[]> {
  return (await sql`
    select date, region, stimulus, body
    from plan
    where region = ${region}
    order by date desc
    limit ${limit}
  `) as unknown as PlanRow[];
}
```

- [ ] **Step 4: Round-trip verify against Neon**

Write a temp script `src/db/tmp-plan-check.ts`:
```typescript
import { logPlan, recentPlans } from "../lib/plans";
import { sql } from "./client";
async function main() {
  await logPlan({ date: "2020-01-01", region: "U", stimulus: "Strength", body: "TEST BODY" });
  const rows = await recentPlans("U", 4);
  console.log("got", rows.length, "rows; newest:", rows[0]?.date, rows[0]?.region);
  console.log("test row present:", rows.some((r) => new Date(r.date).toISOString().slice(0,10) === "2020-01-01"));
  await sql`delete from plan where date = '2020-01-01' and region = 'U'`; // clean up the test row
  await sql.end();
}
main();
```
Run: `tsx --env-file=.env.local src/db/tmp-plan-check.ts`
Expected: prints a row count, `test row present: true`. Then **delete `src/db/tmp-plan-check.ts`** (do not commit it).

- [ ] **Step 5: Commit**
```bash
git add src/db/schema.sql src/lib/plans.ts
git commit -m "feat: plan table + logPlan/recentPlans lib"
```

---

### Task 2: MCP tools `log_plan` + `get_recent_plans`

**Files:**
- Modify: `src/app/api/mcp/route.ts`

- [ ] **Step 1: Import the lib**

At the top of `src/app/api/mcp/route.ts`, after the existing `progress` import, add:
```typescript
import { logPlan, recentPlans } from "../../../lib/plans";
```

- [ ] **Step 2: Register the two tools**

Inside the `createMcpHandler((server) => { … })` callback, after the existing `get_prs` tool registration, add:
```typescript
    server.tool(
      "log_plan",
      "Save the prescribed plan for a session (the programmed exercise blocks) so future generations can rotate variety and read stimulus history. body = the verbatim W/A1/…/F block.",
      {
        date: z.string().optional(),
        region: z.enum(["U", "L"]),
        stimulus: z.enum(["Strength", "Hypertrophy", "Volume"]).optional(),
        body: z.string(),
      },
      async (args) => {
        const row = await logPlan(args);
        return {
          content: [{
            type: "text",
            text: `Plan saved ${row.date} ${row.region}${row.stimulus ? " · " + row.stimulus : ""}`,
          }],
        };
      },
    );

    server.tool(
      "get_recent_plans",
      "Get the last N prescribed plans for a region (U or L), newest first, regardless of stimulus — for stimulus rotation, variety checks, and MU-progression.",
      { region: z.enum(["U", "L"]), limit: z.number().optional() },
      async ({ region, limit }) => {
        const rows = await recentPlans(region, limit ?? 4);
        return { content: [{ type: "text", text: JSON.stringify(rows) }] };
      },
    );
```

- [ ] **Step 3: Build to confirm no type errors**

Run: `cd /Users/julien/Documents/claude/workout-app && npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**
```bash
git add src/app/api/mcp/route.ts
git commit -m "feat: log_plan + get_recent_plans MCP tools"
```

(Deploy happens in Task 5; the connector picks up new tools automatically via `tools/list`.)

---

### Task 3: Seed recent plans

**Files:**
- Create: `src/db/seed-plans.ts`
- Create: `tests/seed-plans.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Create the seed data + runner `src/db/seed-plans.ts`**

```typescript
import { logPlan, type PlanInput } from "../lib/plans";
import { sql } from "./client";

// Last 4 Upper + last 2 Lower sessions from the Notion Workout log (snapshot 2026-06-12),
// so variety/rotation rules have history from session one. No further history needed —
// nothing looks back beyond 3.
export const SEED_PLANS: PlanInput[] = [
  {
    date: "2026-06-12", region: "U", stimulus: "Strength",
    body: `W: Floor L-sit press, Y-W-T back extension, Banded face pulls with ER, Scapular pull-ups
A1: Ring muscle-up row (explosive) 4×3-5 | A2: Kneeling KB press 4×5-6/side | B1: False-grip ring row 4×3-5 | B2: Weighted dips 4×4-5 | C2: Top quarter pull drills 4×5-6
F: Hollow body hold 3×20-30s`,
  },
  {
    date: "2026-06-10", region: "L", stimulus: null,
    body: `W: 90/90 Hip ER PAIL/RAIL, Adductor rockback with thoracic rotation, KB supine lean-back, Glute bridges
A1: Lunge to high knee 3×6/side | B1: Single leg RDL 4×8R/3×8L | B2: Bench-elevated quadruped knee drive 3×10/side | C1: Heel elevated goblet squat 4×8 | C2: Copenhagen deficit dips 3×8/side | D1: Front foot elevated split squat 4×8R/3×8L | D2: Peterson step-downs 4×10R/3×10L`,
  },
  {
    date: "2026-06-09", region: "U", stimulus: "Strength",
    body: `W: Forearm plank to long plank, Y-W-T back extension, Banded pull-aparts, Scapular push-up
A1: Chest-to-bar pull-up 4-5×3-5 | A2: Paused dips (dip bars) 4-5×3-5 | B1: Weighted chin-ups 4×3-5 | B2: Single-arm landmine press 4×6-8L/3×6-8R`,
  },
  {
    date: "2026-06-07", region: "U", stimulus: "Hypertrophy",
    body: `W: Floor L-sit press, Y-W-T back extension, Banded face pulls with ER, Scapular pull-ups
A1: Chest-to-bar pull-up 3-4×4-6 | A2: Copenhagen side plank 3×30s/side | B1: Pull-ups 3-4×6-8 | B2: Dips 3-4×8-10 | C1: Straight-arm pulldown 3×10-12 | C2: Inverted rows 3×10-12
F: Front lever tuck hold 4×5-8s`,
  },
  {
    date: "2026-06-05", region: "U", stimulus: "Strength",
    body: `W: Forearm plank to long plank, Y-W-T back extension, Banded face pulls with ER, Scapular pull-ups
A1: Ring muscle-up row (explosive) 4×3-5 | A2: Russian dips 4×3-5 | B1: Chin-ups 4×3-5 | B2: Kneeling KB press 4×5-6/side | C1: Seated single-arm row 3×8R/3×8L
F: L-sit hold 3×10-15s`,
  },
  {
    date: "2026-06-01", region: "L", stimulus: null,
    body: `W: 90/90 Hip ER PAIL/RAIL, Hamstring walkouts, Glute bridges, Kettlebell weight shift
A1: Side skates 3×8/side | B1: Touchdown squats 4×8R/3×8L | B2: Supine KB hip flexion/extension with bands 3×12/side | C1: Reverse nordic curls 3×6-8 | C2: Pelvic drops 4×12 | D1: Single leg deficit heel raise 3×12/side | D2: Suitcase deadlifts 4×8/side`,
  },
];

async function main() {
  for (const p of SEED_PLANS) await logPlan(p);
  console.log(`Seeded ${SEED_PLANS.length} plans`);
  await sql.end();
}
// Only run when executed directly (so importing SEED_PLANS in tests doesn't hit the DB).
if (process.argv[1] && process.argv[1].endsWith("seed-plans.ts")) main();
```

- [ ] **Step 2: Write the data-invariant test `tests/seed-plans.test.ts`**

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { SEED_PLANS } from "../src/db/seed-plans";

test("seed plans: 4 Upper + 2 Lower", () => {
  assert.equal(SEED_PLANS.filter((p) => p.region === "U").length, 4);
  assert.equal(SEED_PLANS.filter((p) => p.region === "L").length, 2);
});

test("seed plans: bodies non-empty, regions valid, no duplicate (date,region)", () => {
  const seen = new Set<string>();
  for (const p of SEED_PLANS) {
    assert.ok(p.body.trim().length > 0, `${p.date} body empty`);
    assert.ok(p.region === "U" || p.region === "L");
    const key = `${p.date}:${p.region}`;
    assert.ok(!seen.has(key), `duplicate ${key}`);
    seen.add(key);
  }
});
```

(The `main()` call in `seed-plans.ts` is guarded to run only when executed directly, so importing `SEED_PLANS` here never touches the DB.)

- [ ] **Step 3: Run the test to verify it passes**

Run: `cd /Users/julien/Documents/claude/workout-app && npm test`
Expected: the two seed-plans tests PASS; no DB connection attempted by the test.

- [ ] **Step 4: Add the npm script**

In `package.json` `scripts`, add:
```json
"db:seed-plans": "tsx --env-file=.env.local src/db/seed-plans.ts"
```

- [ ] **Step 5: Run the seed against Neon**

Run: `npm run db:seed-plans`
Expected: `Seeded 6 plans`.

- [ ] **Step 6: Verify the read returns them**

Write a temp script `src/db/tmp-plans-read.ts`:
```typescript
import { recentPlans } from "../lib/plans";
import { sql } from "./client";
async function main() {
  const u = await recentPlans("U", 4);
  const l = await recentPlans("L", 4);
  console.log("Upper:", u.map((r) => `${new Date(r.date).toISOString().slice(0,10)} ${r.stimulus}`));
  console.log("Lower:", l.map((r) => new Date(r.date).toISOString().slice(0,10)));
  await sql.end();
}
main();
```
Run: `tsx --env-file=.env.local src/db/tmp-plans-read.ts`
Expected: Upper newest-first = `2026-06-12 Strength, 2026-06-09 Strength, 2026-06-07 Hypertrophy, 2026-06-05 Strength`; Lower = `2026-06-10, 2026-06-01`. Then **delete `src/db/tmp-plans-read.ts`**.

- [ ] **Step 7: Commit**
```bash
git add src/db/seed-plans.ts tests/seed-plans.test.ts package.json
git commit -m "feat: seed last 4 Upper + 2 Lower plans"
```

---

### Task 4: Repoint the generator skill + retire Notion log

**Files:**
- Modify: `/Users/julien/Documents/claude/workout-generator-updated/SKILL.md` (the synced local copy)

Apply these edits to the SKILL.md. After editing, rebuild the bundle (Step 8).

- [ ] **Step 1: Data-fetch table — replace the Workout-log row**

Replace:
```
| 4 | Workout log | Fetch Notion page `https://www.notion.so/Workout-log-3305c3b0c4ea80f7acfff92801efbcf5` |
```
with:
```
| 4 | Recent plans | Call the workout MCP connector tool `get_recent_plans` (region, last 4 — newest-first, any stimulus) |
```

- [ ] **Step 2: Gym-wifi note — update the log reference**

In the "Gym-wifi resilience" paragraph, replace the phrase `the Notion log read` with `the get_recent_plans read`, and replace `the final Notion log append` with `the final log_plan call`. (Leave the rest of the paragraph intact.)

- [ ] **Step 3: Stimulus rotation — change the source**

Replace:
```
Read the last 2–3 upper sessions from the workout log and select the next stimulus.
```
with:
```
Read the last 3 Upper plans (via `get_recent_plans` region=U) and select the next stimulus from their `stimulus` fields.
```

- [ ] **Step 4: Main-block recurrence rule**

Replace:
```
- Core calisthenics (pull-ups, dips, push variations) recur every session — stimulus rotates, movements don't
```
with:
```
- Core calisthenics patterns (a vertical pull, a dip/push) recur every session — but the specific variation must rotate vs the last 3 Upper plans (e.g. weighted pull-ups → chin-ups → chest-to-bar), even across a stimulus change. The pattern persists for progressive overload; the variation moves for stimulus freshness.
```

- [ ] **Step 5: Accessory variety rule (region, not stimulus; last 3)**

Replace:
```
- **Accessory variety:** swap accessories/correctives against the **last 2** same-type sessions, not just the most recent one — otherwise you ping-pong between two templates that each look novel. At least half the accessory/corrective slots must differ from the previous same-type session.
```
with:
```
- **Accessory variety:** check against the **last 3 Upper plans regardless of stimulus** (not per-stimulus — a Strength day must also differ from the Hypertrophy day right before it). At least half the accessory/corrective slots must differ from those last 3 sessions. Checking 3 (not 2) breaks the A/B/A/B ping-pong.
```

- [ ] **Step 6: MU-progression check — source from plans**

Replace:
```
- **Progression check (run every upper session):** apply the rule in `calisthenics-upper-reference.md` — read the last 3 upper sessions, advance the drill if the rep range was hit cleanly in 2 of 3, flag if stalled 4+ sessions
```
with:
```
- **Progression check (run every upper session):** apply the rule in `calisthenics-upper-reference.md` — read the last 3 Upper plans (`get_recent_plans` region=U), advance the drill if the rep range was hit cleanly in 2 of 3, flag if stalled 4+ sessions
```

- [ ] **Step 7: Duplication check + LOG SESSION write**

7a. In Step 5 Output, replace:
```
**Duplication check (run before outputting):** list the exercises from the previous same-type session (from the log). Confirm the new session changes at least half the accessory/corrective slots and rotates ≥1 warm-up.
```
with:
```
**Duplication check (run before outputting):** list the exercises from the last 3 same-region plans (from `get_recent_plans`). Confirm the new session changes at least half the accessory/corrective slots, rotates the main-block variations, and rotates ≥1 warm-up.
```

7b. In `## LOG SESSION`, replace:
```
Prepend to Notion Workout log via `notion-update-page` (`update_content`):
```
with:
```
Save the plan to Neon via the `log_plan` MCP tool — pass `region`, `stimulus` (the Step-2 label; omit on Lower), and `body` = the block below:
```

7c. In the same `## LOG SESSION` bullets, replace:
```
- Keep full history — never delete old entries (the rotation, variety, and MU-progression checks read back through them)
```
with:
```
- `log_plan` upserts on (date, region); history is retained in the `plan` table and read back via `get_recent_plans` (the rotation, variety, and MU-progression checks read the last 3–4)
```

- [ ] **Step 8: Verify no Notion-log references remain, then rebuild the bundle**

Run:
```bash
grep -n "Workout log\|Workout-log\|notion-update-page\|workout log" "/Users/julien/Documents/claude/workout-generator-updated/SKILL.md" || echo "no notion-log refs ✓"
```
Expected: no matches (the `log_plan`/`get_recent_plans` flow has fully replaced it).

Then rebuild the uploadable bundle (the bundle dir `/tmp/wg-skill/workout-generator/` from Phase 1 may be gone; rebuild from the synced local SKILL.md + the other 6 reference files, which are unchanged and still in the existing `/Users/julien/Downloads/workout-generator-updated.skill`):
```bash
cd /tmp && rm -rf wg2 && mkdir -p wg2 && unzip -o /Users/julien/Downloads/workout-generator-updated.skill -d /tmp/wg2 >/dev/null
cp "/Users/julien/Documents/claude/workout-generator-updated/SKILL.md" /tmp/wg2/workout-generator/SKILL.md
cd /tmp/wg2 && rm -f /Users/julien/Downloads/workout-generator-updated.skill && zip -r -X /Users/julien/Downloads/workout-generator-updated.skill workout-generator -x '*.DS_Store' >/dev/null
unzip -l /Users/julien/Downloads/workout-generator-updated.skill | awk '{print $4}' | grep -v '^$'
```
Expected: archive lists all 7 files (`SKILL.md` + 6 reference `.md`s).

(No commit for the generator edits — the generator dir is not a git repo and the workout-app repo has no generator files. The rebuilt `.skill` bundle in Downloads is the deliverable.)

---

### Task 5: Deploy + verify end-to-end (user-gated)

**Files:** none (merge + deploy + manual verification)

- [ ] **Step 1: Merge the feature branch to master**
```bash
git checkout master && git merge --no-ff feat/plan-store -m "Merge: workout plan store (Phase 2 — retire Notion log)"
```

- [ ] **Step 2: Push (auto-deploys) — only after telling Julien**

This push ships the `plan` table tooling and triggers the live deploy (auto-deploy is on). Confirm with Julien, then:
```bash
git push origin master
```
Expected: Vercel builds master; deployment READY in ~1 min (verify via `list_deployments` / `get_deployment` — state `READY`, `source: git`).

- [ ] **Step 3: Connector smoke test (read)**

Verify the new MCP tool is live (auth via the key in `DEPLOY_SECRETS.local.txt`):
```bash
URL=$(grep -i "MCP connector URL" /Users/julien/Documents/claude/workout-app/DEPLOY_SECRETS.local.txt | grep -oE "https://[^ ]+")
curl -s -X POST "$URL" -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | grep -o "get_recent_plans\|log_plan"
```
Expected: prints `log_plan` and `get_recent_plans` (the tools are exposed).

- [ ] **Step 4: Hand off generator re-upload to Julien**

Tell Julien: re-upload `/Users/julien/Downloads/workout-generator-updated.skill` in the Claude app (Settings → Capabilities → Skills, replace `workout-generator`). Then test: generate an Upper session — it should call `get_recent_plans`, rotate the main-block variation + accessories vs the last 3 Upper plans, and on finalize call `log_plan` (no Notion write anywhere).

---

## Notes for the executor
- Run all node/build/DB commands from `/Users/julien/Documents/claude/workout-app` with `.env.local` present.
- Do not push (Task 5 Step 2) without Julien's explicit go — auto-deploy is live.
- The Notion Workout log page is intentionally left in place (not deleted), just no longer written — same treatment as the retired Notion PR table.
- No changes to the Phase 1 actuals/PR path.
