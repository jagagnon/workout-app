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
   - `-Xkg` / "banded" / "assisted" → load_type `assisted`, load_value `-X`.
   - bare weight on a weighted movement (goblet / KB / landmine) → `external`, load_value `X`.
   - bodyweight / "BW" → `bodyweight`, load_value null.
   - holds in seconds → metric_type `seconds`; carries in metres → `meters`.
2. POST to `{WORKOUT_API_URL}/api/log` with header `Authorization: Bearer {WORKOUT_API_TOKEN}`.
3. Show Julien the returned per-exercise lines, PR flags, and any `needs_confirmation`
   exercises. **If an exercise is unmatched, ask before re-sending** — never invent one.
   - If Julien confirms it's a **typo or a variant of an existing lift**, re-send `/api/log`
     with the corrected/canonical name.
   - If he confirms it's a **genuinely new exercise**, POST it to `{WORKOUT_API_URL}/api/exercise`
     (`{canonical_name, aliases?, primary_metric?, default_load_type?}`, same Bearer header),
     then re-send `/api/log`. A `collision` response means it already exists; a `warning` means
     it was created but resembles an existing lift — show Julien the note.

## Reviewing progress
- Trend for a lift: `GET /api/progress?exercise=<canonical>`.
- Muscle-up ladder: `GET /api/progress?ladder=1`.
- Stalled lifts: `GET /api/progress?stalled=1`.
- PR board: `GET /api/prs`.

## Rules
- Summary-per-exercise only (best set + load). Do not invent per-set data.
- Confirm with Julien before creating a new exercise via `/api/exercise` — never auto-create.
