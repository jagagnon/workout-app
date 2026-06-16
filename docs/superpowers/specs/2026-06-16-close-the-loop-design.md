# Close the Loop + Feedback — Phase 3 Design

**Date:** 2026-06-16
**Status:** Approved (design), pending spec review

## Problem

The generator programs blind to performance. It reads plans (prescriptions) + PRs, but never reads **actuals** — so its own rule ("advance the drill if the rep range was hit cleanly in 2 of 3") can't fire, because it's looking at what was prescribed, not what was achieved. There is no autoregulation, and no capture of how a session *felt* (fatigue, joint niggles) — which matters given Julien's L4/L5 history and submaximal style ([[feedback_training_submaximal]]). Progress toward the [[project_muscle_up_goal]] is slower than it needs to be because the loop is open.

## Decision

Capture three signals at log time — **RPE, a feel note, and an MU-question answer** — persist them on the session, and give the generator a read so it can compare actuals to the prescription and **propose load/rep adjustments (you confirm)**. The autoregulation rationale and form cues both render **inline** in the generated programme, never as a separate report.

This is **Phase 3** (Phases 1–2 complete: actuals/PRs and plans both on Neon, Notion retired).

### Settled choices
- **Autoregulation:** propose + reason per lift; Julien confirms (never silent auto-apply).
- **RPE:** single session-level value, 1–10.
- **Feedback is prompted, not passive** — Julien will forget otherwise; the log-time flow asks for it.
- **MU limiter:** surfaced via proactive questions at log time (not a rigid enum); the answer persists as a free-text note and feeds back into programming.
- **Inline rendering:** autoregulation rationale + form cues sit next to each exercise in the session output.

## Components

### 1. Schema — three nullable columns on `session`
```sql
alter table session add column if not exists rpe      smallint check (rpe between 1 and 10);
alter table session add column if not exists feel     text;
alter table session add column if not exists mu_note  text;
```
(`add column if not exists` — idempotent against the existing prod table.)

### 2. `log_workout` gains optional `rpe` / `feel` / `mu_note`

`LogInput` (src/lib/types.ts) gains `rpe?: number`, `feel?: string`, `mu_note?: string`. `logWorkout` (src/lib/log-workout.ts) writes them on the session insert/upsert:
```sql
insert into session (date, region, type, notes, rpe, feel, mu_note)
values (..., ${rpe ?? null}, ${feel ?? null}, ${mu_note ?? null})
on conflict (date, region) do update set
  type    = coalesce(excluded.type, session.type),
  rpe     = coalesce(excluded.rpe, session.rpe),
  feel    = coalesce(excluded.feel, session.feel),
  mu_note = coalesce(excluded.mu_note, session.mu_note)
```
`coalesce` so a partial re-log doesn't wipe values already captured. Fields optional — a rushed log still works.

### 3. New read `get_recent_sessions(region, limit=4)`

A `recentSessions(region, limit)` function (extend/replace the existing `recentSessions` in src/lib/progress.ts) returns recent sessions for a region, newest-first, each with: `date, region, type (stimulus), rpe, feel, mu_note`, and a JSON array of entries `{exercise, metric, metric_type, load_type, load_value, per_side}`. Exposed as MCP tool **`get_recent_sessions`** (params `region`, `limit?`). This is the pipe that lets the generator see performance + feel + MU notes.

### 4. Generator skill updates

- **Data to fetch:** add `get_recent_sessions` (region, last 4) alongside `get_recent_plans` + `get_prs`.
- **Autoregulation (propose + reason, inline):** for each recurring lift, compare the best-set actual to the prescribed range and factor in RPE/feel, then prescribe the adjusted load/reps with the rationale **inline next to the exercise**. Examples:
  - `B2: Weighted dips 4×4-5 @ +7.5kg  (↑ from +5kg — hit 4×5 @ +5, RPE 7)`
  - `A1: Banded muscle-up 3×4-6 @ heavy band  (hold — last time RPE 9, "transition stalled")`
  - A pain/niggle flag in `feel` → deload or swap that movement, noted inline.
  Julien can override any call.
- **MU progression:** read recent actuals + recent `mu_note`s; advance the drill only if the rep range was actually hit in 2 of 3; target the limiter that recurs in the notes.
- **Form cues stay inline** as today (e.g. `(cue: level pelvis, no R hip hike)`) — Phase 3 adds the autoreg rationale alongside, not in place of, them.
- **LOG SESSION prompts:** when Julien pastes results, the skill asks for (a) overall **RPE 1–10**, (b) a short **feel/niggles** note, (c) **1–2 targeted MU questions**, rotating by the day's drill — pull height ("chest to bar?"), transition ("where did the rep break?"), dip/lockout. Pass `region`, `type` (stimulus), `rpe`, `feel`, `mu_note`, and the entries to `log_workout`.

### 5. `workout-log` Claude Code skill — parity

Same optional `rpe`/`feel`/`mu_note` fields and the same log-time prompts, so the laptop path matches the chat path.

## Data flow
`log_workout` writes actuals + rpe/feel/mu_note → Neon `session`/`entry`. Generator reads `get_recent_sessions` + `get_recent_plans` + `get_prs` → proposes inline adjustments Julien confirms → writes the new plan via `log_plan`. Loop closed.

## Error handling / dependencies
- New MCP tool + `log_workout` field changes require a deploy (auto-deploy on push). Connector picks up the new tool automatically.
- Generator skill bundle re-uploaded to the Claude app.
- Fields optional; `get_recent_sessions` failure (wifi) → degrade to asking Julien how recent sessions went.
- `rpe` constrained 1–10 at the DB.

## Verification
1. `log_workout` with `rpe`/`feel`/`mu_note` persists them; `get_recent_sessions` returns them with entries, newest-first, region-filtered.
2. Re-log without the fields doesn't wipe previously captured values (coalesce).
3. A generated session shows inline autoregulation rationale (load moved with a reason) + inline cues.
4. Log-time flow prompts for RPE + feel + an MU question.

## Out of scope
- Per-exercise RPE / pain flags (session-level only).
- MU-readiness benchmarks and ladder projection (explicitly dropped).
- Per-set capture (actuals remain best-set-per-exercise).
