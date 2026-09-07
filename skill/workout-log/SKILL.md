---
name: workout-log
description: >
  Log Julien's training actuals and review progress. Use when he says "log workout",
  "log my session", pastes a session dump, or asks "how am I trending / am I stalling /
  muscle-up progress". Parses his dump into structured entries and POSTs to the workout app.
---

# Workout Log Skill

> **The app is the primary logging surface.** Julien logs on his phone at
> `{WORKOUT_API_URL}/log`, which renders the prescribed session as a pre-filled
> form and writes the actuals. This skill is the **fallback** — for a chat dump
> after the fact, a correction, or a session logged away from the phone.
>
> `entry.notes` is for Julien's own observations, not a progression call: the
> generator makes that call when it writes the next session, off the prescription
> and the actuals.

## Endpoint
- Base URL: read `WORKOUT_API_URL` (e.g. `https://<deploy>`); token: `WORKOUT_API_TOKEN`.
- Both live in `~/.claude/skills/workout-log/.env` (gitignored).

## Logging a session
1. Parse Julien's dump into entries. Each exercise → `{exercise, metric, metric_type?,
   load_type, load_value?, sets?, skipped?}`.
   - `sets` = sets actually performed (`metric` stays the best set). Optional.
   - `skipped: true` for a prescribed lift he deliberately didn't do — send the row
     with `metric: 0` rather than omitting it. It's kept as an adherence signal and
     excluded from every PR/progression query.
   - `load_value` is always the **total** lifted, however many hands carry it: 10kg in
     each hand is `20`. "3x8/side" in his dump is reps per leg and never changes the
     number. If which hand held what matters, put it in `notes`.
   - `+Xkg` → load_type `added`, load_value `X`.
   - `-Xkg` / "banded" / "assisted" → load_type `assisted`, load_value `-X`.
   - bare weight on a weighted movement (goblet / KB / landmine) → `external`, load_value `X`.
   - bodyweight / "BW" → `bodyweight`, load_value null.
   - **load unspecified + no loaded history for that lift → default `bodyweight` (load_value null); don't re-confirm.** Only ask about a missing load when the lift normally carries external weight (has loaded history, or is a known weighted movement — goblet / KB / landmine / dumbbell).
   - holds in seconds → metric_type `seconds`; carries in metres → `meters`.
   - Also capture session-level **`rpe`** (1–10). Include `rpe` (and `region`, `type` if
     known) in the POST body alongside `entries`.
   - **There is no `feel` or `mu_note` any more.** An observation belongs on the exercise
     it is about, in that entry's `notes` — including anything about the muscle-up, which
     is read off the MU lift's own note. Both fields restated what the entry notes already
     said; the API no longer accepts them.
2. **Resolve novel lifts before sending.** While parsing, flag any exercise that looks genuinely new (not an obvious typo/variant of a known lift). Create it *first* — confirm with Julien, then `POST /api/exercise` — and only then assemble and send the `/api/log` call. Creating up front keeps logging to one clean call so a creation failure can't strand already-parsed set data. Step 4 stays as the fallback for anything that still comes back unmatched.
3. POST to `{WORKOUT_API_URL}/api/log` with header `Authorization: Bearer {WORKOUT_API_TOKEN}`.
4. Show Julien the returned per-exercise lines, PR flags, and any `needs_confirmation`
   exercises. **If an exercise is unmatched, ask before re-sending** — never invent one.
   - If Julien confirms it's a **typo or a variant of an existing lift**, re-send `/api/log`
     with the corrected/canonical name.
   - If he confirms it's a **genuinely new exercise**, POST it to `{WORKOUT_API_URL}/api/exercise`
     (`{canonical_name, aliases?, primary_metric?, default_load_type?}`, same Bearer header),
     then re-send `/api/log`. A `collision` response means it already exists; a `warning` means
     it was created but resembles an existing lift — show Julien the note.

5. **Close with the dashboard link** — `{WORKOUT_API_URL}` — so he can see the PR board and ladder reflect what was just logged.

## Reviewing progress
**Every read below needs `Authorization: Bearer {WORKOUT_API_TOKEN}`, same as the
writes.** These used to be open; they are not any more, and an unauthenticated
call now returns 401 rather than data.

- Trend for a lift: `GET /api/progress?exercise=<canonical>`.
- Muscle-up ladder: `GET /api/progress?ladder=1`.
- Stalled lifts: `GET /api/progress?stalled=1`.
- PR board: `GET /api/prs`.

## Rules
- Summary-per-exercise only (best set + load). Do not invent per-set data.
- Confirm with Julien before creating a new exercise via `/api/exercise` — never auto-create.
- The RPE prompt + load-type semantics here are mirrored in the chat-mode `workout-generator` skill (LOG SESSION). Keep the two in sync if either changes.
