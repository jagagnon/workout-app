# PR / Actuals Unification — Phase 1 Design

**Date:** 2026-06-15
**Status:** Approved (design), pending spec review

## Problem

Workout weights and PRs are tracked in two places that overlap:

- **Notion PR table** (`PR-table-3305c3b0...`) — current best per exercise, updated manually only when beaten. Read by the chat-mode `workout-generator` for progressive overload; written by the `workout-pr-tracker` skill.
- **Neon DB** (workout-app) — every session's actuals (best set: reps + weight per exercise). Auto-derives PRs via the `v_prs` view and `is_pr` detection. Read by the dashboard + muscle-up ladder.

The same fact (best weight per exercise) lives in both stores, so it is unclear what belongs where and the two can drift. This is the "is this a PR or an actuals update?" ambiguity.

## Decision

**The Neon DB is the single source of truth for weights and PRs.** The Notion PR table and the `workout-pr-tracker` skill are retired. PRs are never stored as a separate fact — they are derived from logged actuals (`v_prs` / `is_pr`). There is no "PR vs actuals" decision: every result is an actuals write; "PR" is a computed label returned to the user.

This is **Phase 1**. Phase 2 (separate spec) will migrate the Notion *Workout log* (prescription structure / stimulus rotation) into Neon and retire Notion for workouts entirely.

## Data flow (after Phase 1)

| Store | Holds | Written by | Read by |
|---|---|---|---|
| **Neon DB** | actuals (reps+weight per exercise/session) + derived PRs | `log_workout` (MCP + `/api/log`) | dashboard, ladder, generator's progressive-overload weights via `get_prs` |
| **Notion Workout log** | prescription structure + stimulus label (no weights) | generator at design time | generator's rotation/variety (unchanged, Phase 2 target) |
| ~~Notion PR table~~ | — | **retired** (page left in place, no longer written) | — |

Primary logging path: **chat mode on phone**, via the workout MCP connector (`log_workout`). Same path also available from phone Claude / Claude Code.

## Components

### 1. PR migration script (`src/db/migrate-prs.ts`)

One-time, idempotent, committed for review. Reads a **reviewed mapping** (embedded structured data, derived from the current Notion PR table — not a live Notion fetch at run time) and writes it into the DB.

For each PR row:
1. **Decode the load** from notation:
   - `+Xkg` → `added`, `load_value = X`
   - `-Xkg` → `assisted`, `load_value = -X`
   - bare `Xkg` → `external`, `load_value = X`
   - `N reps (BW)` → `bodyweight`, `metric_value = N`, `load_value = null`
   - `X total (Y each)` / `Y per hand` → `per_side = true`, `load_value = Y`
   - holds (`isometric`, `plank`) with a weight → `metric_type = seconds` where a duration exists, else treat the weight as `external` load on a reps metric; flagged rows resolved case-by-case (see Judgment calls)
2. **Match exercise** to the registry via the existing `matchExercise` logic (exact/alias). Unmatched names create a **new exercise row** with inferred `primary_metric` + `default_load_type` and `is_key = false`. All inferred new-exercise metadata is surfaced for confirmation before the script runs — exercises are never silently invented.
3. **Write a baseline entry** dated to the row's "Last Updated" value (fallback: `2026-06-05`, the table snapshot date). Rows are grouped into one baseline `session` per distinct date (`region = null`, `type = null`, `notes = 'PR baseline import'`). The script looks up an existing baseline session for that date before inserting, so re-runs do not duplicate.

The full roster imports (not just the 12 calisthenics matches) — the generator prescribes lower-body and accessory lifts, so their PRs must be in Neon or progressive overload regresses.

#### Judgment calls (resolved with Julien before running, not auto)
- **`Muscle-ups -25kg` vs `Muscle-ups (ORM) -20kg`** — both map to `Muscle-up`. Default: import the working-set value (`-25kg`) as the Muscle-up baseline; the ORM is a separate attempt, not the working assist. Confirm.
- **Corrupted row** — the *Suitcase deadlift* cell contains a merged *Weighted pullover \| 12kg \| 2026-05-14* fragment. Split into two exercises: Suitcase deadlift `20kg`, Weighted pullover `12kg`.
- **`Dips` + `Dips (rep max)`** — fold into one `Dips` exercise carrying both a load PR (`+10kg`) and a metric PR (`13 reps`). Same for `Pull-ups` + `Pull-ups (rep max)`.

### 2. Repoint `workout-generator` skill

- **Pre-generate:** replace the `workout-pr-tracker` PR fetch (table row #3) with the workout MCP connector's `get_prs` tool. Progressive-overload weights come from `get_prs`.
- **Post-workout:** replace the `workout-pr-tracker` update with the MCP `log_workout` tool. One results paste → one `log_workout` call → DB writes actuals and returns per-exercise `is_pr`. The skill reports which lifts were PRs (the `is_pr` flags), no separate PR write.
- **Unchanged:** the Notion Workout-log append at design time (Phase 2 target).
- **Delete** the "Delegated Skills → workout-pr-tracker" reference.

### 3. Retire `workout-pr-tracker`

Delete the skill (`~/.claude/skills/` and the `.skill` bundle). Leave the Notion PR page in place but no longer written. The generator no longer delegates to it.

### 4. `workout-log` skill parity

Confirm the Claude Code `workout-log` skill and the chat-mode generator hit the identical `log_workout` / `/api/log` path with the same parse rules (load-type encoding, summary-per-exercise, `needs_confirmation` handling). No behavior change expected — this is a verification step.

### 5. Bundled fix

The y-axis label truncation fix (`LadderChart.tsx` — positive left margin + wider gutter) ships with this Phase's deploy.

## Error handling / dependencies

- **MCP connector must be enabled in the Claude app** for chat-mode generation. If unavailable/offline (gym wifi), the generator degrades as it already does for the Notion log: ask Julien for last bests and proceed. The only hard-required call remains the log write.
- **Exercise-name mismatches** at migration time are surfaced for confirmation, never auto-created silently.
- **Idempotency:** entry `unique(session_id, exercise_id)` and baseline-session-by-date lookup make the migration and all logging safely re-runnable.

## Verification

1. **Migration:** after running, `get_prs` (and `/api/prs`) returns values matching the Notion PR table for every imported exercise; the muscle-up ladder shows a baseline `-25kg @ 2026-03-28` point.
2. **Generator read:** a generated session prescribes at the migrated PR weights.
3. **Round-trip:** a results paste through `log_workout` writes actuals and flags `is_pr` correctly (e.g. today's session as the first real run).
4. **No regression:** dashboard PR board (key lifts) and ladder render with imported data; existing logged sessions intact.

## Out of scope (Phase 2)

- Migrating the Notion Workout log (prescription structure) into a Neon `prescription` table (`date × exercise`, sets×reps, stimulus).
- Generator reading rotation/variety from Neon.
- Fully retiring Notion for workouts.
