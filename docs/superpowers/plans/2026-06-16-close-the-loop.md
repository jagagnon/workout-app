# Close the Loop + Feedback — Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture RPE + feel + an MU-question note at log time and feed recent actuals back to the generator, so it proposes inline, evidence-based load/rep adjustments the user confirms.

**Architecture:** Add `rpe`/`feel`/`mu_note` columns to `session`; `log_workout` accepts and stores them (coalesced on re-log). A new `recentActuals(region, limit)` read (separate from the dashboard's `recentSessions`) returns recent sessions with entries + the feedback fields, exposed as MCP tool `get_recent_sessions`. The generator fetches it and renders autoregulation rationale + cues inline in the session.

**Tech Stack:** TypeScript, postgres.js, `mcp-handler` + zod, `node:test` + `tsx`, Neon, Vercel (auto-deploy on push to master).

**Environment note:** Controller can't run node/build/DB directly. Subagents run from `/Users/julien/Documents/claude/workout-app` with `.env.local`; load env via `tsx --env-file=.env.local` or `set -a; source .env.local; set +a` for `npm run db:schema`. `npm test` does not load env — DB work is verified via round-trip scripts.

**Branch:** Work on `feat/close-the-loop`; auto-deploy is live on `master`, so merge+push only at the end with user consent.

---

## File Structure
- **Modify** `src/db/schema.sql` — three `alter table session add column if not exists …`.
- **Modify** `src/lib/types.ts` — add `rpe`/`feel`/`mu_note` to `LogInput`.
- **Modify** `src/lib/log-workout.ts` — store the new fields on the session insert/upsert.
- **Modify** `src/lib/progress.ts` — add `recentActuals(region, limit)` (leave `recentSessions` untouched).
- **Modify** `src/app/api/mcp/route.ts` — add `get_recent_sessions` tool.
- **Modify** generator `SKILL.md` (local `/Users/julien/Documents/claude/workout-generator-updated/SKILL.md`; rebuild bundle to `/Users/julien/Downloads/workout-generator-updated.skill`).
- **Modify** `~/.claude/skills/workout-log/SKILL.md` — log-time prompts + pass new fields.

---

### Task 1: Schema + `log_workout` feedback fields

**Files:**
- Modify: `src/db/schema.sql`
- Modify: `src/lib/types.ts`
- Modify: `src/lib/log-workout.ts`

- [ ] **Step 1: Add columns in `src/db/schema.sql`**

Append at the end of the file:
```sql

alter table session add column if not exists rpe      smallint check (rpe between 1 and 10);
alter table session add column if not exists feel     text;
alter table session add column if not exists mu_note  text;
```

- [ ] **Step 2: Apply to Neon**

Run: `set -a; source .env.local; set +a; npm run db:schema`
Expected: runs cleanly (ALTERs are no-ops if columns exist). Non-destructive.

- [ ] **Step 3: Extend `LogInput` in `src/lib/types.ts`**

Change the `LogInput` interface to:
```typescript
export interface LogInput {
  date?: string;
  region?: "U" | "L";
  type?: "Strength" | "Hypertrophy" | "Volume";
  rpe?: number;
  feel?: string;
  mu_note?: string;
  entries: EntryInput[];
}
```

- [ ] **Step 4: Store the fields in `src/lib/log-workout.ts`**

Replace the session insert block:
```typescript
  const [sessionRow] = await sql`
    insert into session (date, region, type, notes)
    values (${date}, ${input.region ?? null}, ${input.type ?? null}, ${null})
    on conflict (date, region) do update set type = coalesce(excluded.type, session.type)
    returning id
  `;
```
with:
```typescript
  const [sessionRow] = await sql`
    insert into session (date, region, type, notes, rpe, feel, mu_note)
    values (${date}, ${input.region ?? null}, ${input.type ?? null}, ${null},
            ${input.rpe ?? null}, ${input.feel ?? null}, ${input.mu_note ?? null})
    on conflict (date, region) do update set
      type    = coalesce(excluded.type, session.type),
      rpe     = coalesce(excluded.rpe, session.rpe),
      feel    = coalesce(excluded.feel, session.feel),
      mu_note = coalesce(excluded.mu_note, session.mu_note)
    returning id
  `;
```

- [ ] **Step 5: Round-trip verify**

Temp script `src/db/tmp-feedback-check.ts`:
```typescript
import { logWorkout } from "../lib/log-workout";
import { sql } from "./client";
async function main() {
  await logWorkout({ date: "2020-02-02", region: "U", type: "Strength", rpe: 8,
    feel: "left elbow cranky", mu_note: "transition stalled",
    entries: [{ exercise: "Pull-ups", metric: 5, load_type: "bodyweight" }] });
  const [s] = await sql`select rpe, feel, mu_note from session where date='2020-02-02' and region='U'`;
  console.log("stored:", s);
  // partial re-log must not wipe feel/mu_note:
  await logWorkout({ date: "2020-02-02", region: "U", rpe: 6,
    entries: [{ exercise: "Pull-ups", metric: 6, load_type: "bodyweight" }] });
  const [s2] = await sql`select rpe, feel, mu_note from session where date='2020-02-02' and region='U'`;
  console.log("after partial re-log:", s2);
  await sql`delete from session where date='2020-02-02' and region='U'`;
  await sql.end();
}
main();
```
Run: `tsx --env-file=.env.local src/db/tmp-feedback-check.ts`
Expected: first log → `{ rpe: 8, feel: 'left elbow cranky', mu_note: 'transition stalled' }`; after partial re-log → `{ rpe: 6, feel: 'left elbow cranky', mu_note: 'transition stalled' }` (rpe updated, feel/mu_note preserved by coalesce). Then DELETE the temp script.

- [ ] **Step 6: Build + commit**

Run: `npm run build` (expect success).
```bash
git add src/db/schema.sql src/lib/types.ts src/lib/log-workout.ts
git commit -m "feat: capture rpe/feel/mu_note on log_workout"
```

---

### Task 2: `recentActuals` read + `get_recent_sessions` MCP tool

**Files:**
- Modify: `src/lib/progress.ts`
- Modify: `src/app/api/mcp/route.ts`

- [ ] **Step 1: Add `recentActuals` to `src/lib/progress.ts`**

Append this function (leave the existing `recentSessions` untouched — the dashboard uses it):
```typescript
export async function recentActuals(region: "U" | "L", limit = 4) {
  return (await sql`
    select s.date, s.region, s.type, s.rpe, s.feel, s.mu_note,
           json_agg(json_build_object(
             'exercise', x.canonical_name, 'metric', e.metric_value, 'metric_type', e.metric_type,
             'load_type', e.load_type, 'load_value', e.load_value, 'per_side', e.per_side
           ) order by e.id) as entries
    from session s
    join entry e on e.session_id = s.id
    join exercise x on x.id = e.exercise_id
    where s.region = ${region}
    group by s.id
    order by s.date desc
    limit ${limit}
  `) as unknown as Array<Record<string, unknown>>;
}
```

- [ ] **Step 2: Import + register the MCP tool in `src/app/api/mcp/route.ts`**

Change the progress import to include `recentActuals`:
```typescript
import { exerciseProgression, muscleUpLadder, prBoard, recentActuals } from "../../../lib/progress";
```
After the `get_recent_plans` tool registration, add:
```typescript
    server.tool(
      "get_recent_sessions",
      "Get the last N actual sessions for a region (U or L), newest first — per-exercise results plus rpe, feel, and mu_note. Use to autoregulate: compare what was done vs prescribed, and read recent feel/MU notes.",
      { region: z.enum(["U", "L"]), limit: z.number().optional() },
      async ({ region, limit }) => {
        const rows = await recentActuals(region, limit ?? 4);
        return { content: [{ type: "text", text: JSON.stringify(rows) }] };
      },
    );
```

- [ ] **Step 3: Build + round-trip verify**

Run: `npm run build` (expect success).

Temp script `src/db/tmp-actuals-read.ts`:
```typescript
import { recentActuals } from "../lib/progress";
import { sql } from "./client";
async function main() {
  const rows = await recentActuals("U", 4);
  console.log("rows:", rows.length);
  console.log("sample keys:", rows[0] ? Object.keys(rows[0]) : "none");
  console.log("first entry sample:", rows[0] ? (rows[0].entries as unknown[])[0] : "none");
  await sql.end();
}
main();
```
Run: `tsx --env-file=.env.local src/db/tmp-actuals-read.ts`
Expected: returns recent Upper sessions; `sample keys` includes `date, region, type, rpe, feel, mu_note, entries`; the first entry has `exercise, metric, metric_type, load_type, load_value, per_side`. (Session 43 from 2026-06-16 should appear.) Then DELETE the temp script.

- [ ] **Step 4: Commit**
```bash
git add src/lib/progress.ts src/app/api/mcp/route.ts
git commit -m "feat: recentActuals + get_recent_sessions MCP tool"
```

---

### Task 3: Generator skill — autoregulation + log-time prompts

**Files:**
- Modify: `/Users/julien/Documents/claude/workout-generator-updated/SKILL.md`

Apply these edits, then rebuild the bundle (Step 7).

- [ ] **Step 1: Add the actuals fetch (Data-fetch table)**

After the row:
```
| 4 | Recent plans | Call the workout MCP connector tool `get_recent_plans` (region, last 4 — newest-first, any stimulus) |
```
add:
```
| 5 | Recent actuals | Call `get_recent_sessions` (region, last 4) — per-exercise results + RPE/feel/MU notes, for autoregulation |
```

- [ ] **Step 2: Replace the Progressive-overload bullet with autoregulation**

Replace:
```
**Progressive overload:** Prescribe at PR weight. Suggest in Notes: +1–2 reps same weight, or +2.5 kg if top of range clearly met.
```
with:
```
**Autoregulation (propose + reason, inline):** for each recurring lift, compare last session's best-set actual (from `get_recent_sessions`) to its prescribed range, and factor in RPE/feel:
- Hit top of range cleanly, RPE ≤ 7 → progress (+2.5kg, or +1–2 reps if not yet at top).
- Hit mid-range or RPE 8–9 → hold the load.
- Missed range, RPE 10, or a pain/niggle flagged in `feel` → deload or swap to a gentler variation for that pattern.
State the call **inline next to the exercise** with the evidence (see Step 5). Julien can override any call. Fall back to PR weight (`get_prs`) when there's no recent actual for a lift.
```

- [ ] **Step 3: Update the MU progression check to read actuals**

Replace:
```
- **Progression check (run every upper session):** apply the rule in `calisthenics-upper-reference.md` — read the last 3 Upper plans (`get_recent_plans` region=U), advance the drill if the rep range was hit cleanly in 2 of 3, flag if stalled 4+ sessions
```
with:
```
- **Progression check (run every upper session):** apply the rule in `calisthenics-upper-reference.md` — read the last 3 Upper sessions' **actuals** (`get_recent_sessions` region=U): advance the drill only if the rep range was actually hit in 2 of 3, flag if stalled 4+ sessions. Read recent `mu_note`s and bias the MU drill toward the limiter that recurs (e.g. notes keep saying "transition" → program more transition work).
```

- [ ] **Step 4: Add the inline-rationale format to Step 5 Output**

Replace:
```
Superset labelling (A1/A2 etc.), side annotations, PR inline:
`Bulgarian Split Squat — 4×8 R / 3×8 L @ 3-1-1-0  (PR: 17.5kg)`
```
with:
```
Superset labelling (A1/A2 etc.), side annotations, load + autoregulation rationale + cues all inline:
`Weighted dips — 4×4-5 @ +7.5kg  (↑ from +5kg — hit 4×5 @ +5, RPE 7)`
`Bulgarian Split Squat — 4×8 R / 3×8 L @ 3-1-1-0  (PR 17.5kg; cue: level pelvis, no R hip hike)`
`Banded muscle-up — 3×4-6 heavy band  (hold — last RPE 9, note "transition stalled")`
Keep the rationale terse and parenthetical; never break it out into a separate section.
```

- [ ] **Step 5: Add log-time prompts in LOG SESSION**

Find the `**Results → Neon:**` bullet (the `log_workout` bullet) and insert these two bullets immediately BEFORE it:
```
- **Before logging results, prompt Julien** (he'll forget otherwise) for: (a) overall **RPE 1–10**, (b) a short **feel / any niggles** note, (c) **1–2 targeted muscle-up questions**, rotating by the day's MU drill — pull height ("get chest to bar?"), transition ("where did the rep break — pull or transition?"), or dip/lockout. Keep it to one quick exchange.
- Pass `region`, `type` (the stimulus), `rpe`, `feel`, and `mu_note` to `log_workout` alongside the entries.
```

- [ ] **Step 6: Verify edits**

Run:
```bash
grep -n "get_recent_sessions\|Autoregulation\|RPE 1–10\|mu_note" "/Users/julien/Documents/claude/workout-generator-updated/SKILL.md"
```
Expected: matches for the actuals fetch, autoregulation block, the RPE prompt, and `mu_note`/`get_recent_sessions` in MU progression + LOG SESSION.

- [ ] **Step 7: Rebuild the bundle**

```bash
cp "/Users/julien/Documents/claude/workout-generator-updated/SKILL.md" /tmp/wg-skill/workout-generator/SKILL.md
cd /tmp/wg-skill && rm -f /Users/julien/Downloads/workout-generator-updated.skill && zip -r -X /Users/julien/Downloads/workout-generator-updated.skill workout-generator -x '*.DS_Store' >/dev/null
unzip -l /Users/julien/Downloads/workout-generator-updated.skill | awk '{print $4}' | grep -v '^$'
```
Expected: archive lists all 7 files. (If `/tmp/wg-skill/workout-generator/` is gone, recreate it by unzipping the current bundle first.)

---

### Task 4: `workout-log` Claude Code skill — parity

**Files:**
- Modify: `~/.claude/skills/workout-log/SKILL.md`

- [ ] **Step 1: Add the feedback fields to the entry-parse / payload section**

In the "Logging a session" section, after the bullet describing the per-exercise fields, add:
```
   - Also capture session-level **`rpe`** (1–10), **`feel`** (short "how it went / any niggles" note), and **`mu_note`** (answer to a muscle-up question). **Prompt Julien for these** when logging — he'll forget otherwise. Include `rpe`, `feel`, `mu_note` (and `region`, `type` if known) in the POST body alongside `entries`.
```

- [ ] **Step 2: Verify**

Run: `grep -n "rpe\|feel\|mu_note" ~/.claude/skills/workout-log/SKILL.md`
Expected: the new fields are present in the logging instructions.

(No commit — `~/.claude/skills` is outside the repo. The edit is live in place.)

---

### Task 5: Deploy + verify (user-gated)

**Files:** none (merge + deploy + verification)

- [ ] **Step 1: Merge the feature branch**
```bash
git checkout master && git merge --no-ff feat/close-the-loop -m "Merge: close the loop + feedback (Phase 3)"
```

- [ ] **Step 2: Push (auto-deploys) — only after telling Julien**
```bash
git push origin master
```
Expected: Vercel builds master; deployment READY in ~1 min (verify via `get_deployment` — state `READY`, `source: git`).

- [ ] **Step 3: Connector smoke test**
```bash
URL=$(grep -i "MCP connector URL" /Users/julien/Documents/claude/workout-app/DEPLOY_SECRETS.local.txt | grep -oE "https://[^ ]+")
curl -s -X POST "$URL" -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | grep -o "get_recent_sessions"
```
Expected: prints `get_recent_sessions`.

- [ ] **Step 4: Hand off to Julien**

Tell Julien: re-upload `/Users/julien/Downloads/workout-generator-updated.skill` in the Claude app. Then test: generate an Upper session — it should pull `get_recent_sessions`, propose inline load adjustments with reasoning, and at log time prompt for RPE + feel + an MU question.

---

## Notes for the executor
- Run all node/build/DB commands from `/Users/julien/Documents/claude/workout-app` with `.env.local`.
- Do not push (Task 5 Step 2) without Julien's explicit go — auto-deploy is live.
- No changes to the dashboard `recentSessions` query or the Phase 1/2 paths.
