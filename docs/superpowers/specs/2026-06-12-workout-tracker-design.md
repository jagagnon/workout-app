# Workout Tracker — Design

**Date:** 2026-06-12
**Status:** Approved for planning
**App location:** `/Users/julien/Documents/claude/workout-app` (new app, separate from `crm-app`)

## Problem

Workouts are generated and logged as prescriptions into a Notion "Workout log" page, but
nothing captures **actuals** in a queryable shape. There is no easy way to see whether Julien
is hitting his rep targets, progressing in load, or stalling. The only longitudinal signal is a
hand-maintained Notion "PRs" table, which is lossy (all-time bests only) and already corrupting
(markdown-table rows merging into one cell).

**Goal:** capture actuals → store in Postgres → chart progress and detect PRs. Pointed
specifically at the December 2026 unassisted strict bar muscle-up goal.

## Key decisions (settled during brainstorm)

1. **Actuals-only.** The prescription is scaffolding; *actuals are the product*. The workout
   generator stays unchanged (keeps writing plans to Notion). The app does not store or
   match against the plan.
2. **Summary per exercise.** Capture the **best set + load** per exercise per session — not
   per-set arrays, not RPE. Fastest to dictate; best-set-over-time is the progress signal.
   Accepted trade-off: no within-session rep-decay visibility (e.g. 5,5,4,3).
3. **New app, not `crm-app`.** Mirrors crm-app conventions (Next.js 16, postgres.js, no ORM,
   `schema.sql`), but is its own project and repo.
4. **Neon Postgres on Vercel.** A local DB can't be reached from the phone or a cloud
   function; managed Postgres is required. Provisioned via the Vercel Marketplace.
5. **Approach A — Claude does the parsing.** Both capture doors are Claude, so Claude
   structures the spoken dump into typed tool arguments. The server is a thin, typed
   write/read layer with no server-side LLM. (A future non-Claude door, e.g. Telegram, could
   add server-side parsing without changing the server's contract — additive only.)
6. **Two doors, one HTTP write path.** Phone = remote MCP server (custom connector).
   Laptop = Claude Code skill that `curl`s the **same HTTP endpoints** (not the DB directly),
   so validation / name-matching / PR detection live in exactly one place.

## Architecture

```
                    ┌─────────────────────────────┐
   Phone Claude ───▶│  MCP server   (/api/mcp)     │
   (gym, voice)     │   tools: log_workout, …      │─┐
                    └─────────────────────────────┘ │
                    ┌─────────────────────────────┐ │   ┌──────────────┐
   Laptop Claude ──▶│  Claude Code skill           │─┼──▶│ logWorkout() │──▶ Neon
   Code (analysis)  │   (curl → same HTTP API)     │ │   │  core module │
                    └─────────────────────────────┘ │   └──────────────┘
                    ┌─────────────────────────────┐ │          │ reads
   Browser ────────▶│  Dashboard  ( / )  read-only │◀┘──────────┘
                    └─────────────────────────────┘
```

- **`logWorkout()` core** — single module; validates an entry, normalizes the exercise name,
  writes the row, runs PR detection. All writes go through it.
- **HTTP API** — thin routes (`POST /api/log`, `GET /api/progress`, `GET /api/prs`) over the core.
- **MCP server** (`/api/mcp`) — exposes `log_workout`, `get_progress`, `get_prs` to phone/web
  Claude via a custom connector. Validates args → calls core.
- **Claude Code skill** (`workout-log`) — laptop door; `curl`s the HTTP API with a bearer token.
- **Dashboard** (`/`) — read-only Next.js pages reading Neon. No writes.

## Data model

Three tables; PRs are a **derived view** (never stored — avoids the Notion table's corruption).

```sql
exercise            -- canonical registry, keeps charts coherent
  id, canonical_name        -- "Chin-ups" (NOT "Weighted chin-ups"; weight lives on the entry)
  aliases text[]            -- ["chins","weighted chin-ups"] → fuzzy-match dumps to one identity
  primary_metric            -- 'reps' | 'seconds' | 'meters'   (holds, carries)
  default_load_type
  created_at

session             -- one training day
  id, date, region          -- 'U' | 'L'
  type, notes               -- 'Strength' | 'Hypertrophy' | 'Volume' | null
  created_at

entry               -- one exercise's best set in a session (summary-per-exercise)
  id, session_id → session, exercise_id → exercise
  metric_type               -- 'reps' | 'seconds' | 'meters'
  metric_value              -- best-set reps / hold seconds / carry metres
  load_type                 -- 'added' | 'assisted' | 'external' | 'bodyweight'
  load_value                -- numeric, signed; null when bodyweight
  load_unit                 -- 'kg' (default)
  per_side  bool
  notes, created_at
```

Indexes: `entry(exercise_id, created_at)`, `session(date)`.
Idempotency: unique on `(session_id, exercise_id)` — re-logging an exercise the same day
**updates** rather than duplicates (corrections overwrite).

### Load model (the crux — powers the muscle-up ladder)

Four `load_type` values cover everything in the existing log:

| load_type    | meaning                                  | example                     | load_value |
|--------------|------------------------------------------|-----------------------------|------------|
| `added`      | extra weight on a bodyweight movement    | weighted chin-ups `+10kg`   | `+10`      |
| `assisted`   | band/assistance reducing bodyweight      | banded muscle-up `-25kg`    | `-25`      |
| `external`   | the weight *is* the load                 | goblet squat `16kg`         | `16`       |
| `bodyweight` | pure bodyweight                          | pull-ups BW                 | `null`     |

The **muscle-up ladder** is simply `load_value` over time for "Muscle-up", trending from
negative (`assisted`) through zero into positive (`added`). One line = the whole December goal.

### PRs (derived view)

`v_prs`: per exercise, the max load and the max metric (reps/seconds/meters). Computed live
from `entry`; always correct, cannot drift or corrupt.

## `log_workout` contract

Claude passes structured args (it does the parsing). One call can carry a whole session.

```
log_workout({
  date?:   "2026-06-12"            // defaults to today (Europe/Zurich)
  region?: "U" | "L"
  type?:   "Strength" | "Hypertrophy" | "Volume"
  entries: [
    { exercise: "muscle-up", metric: 5, metric_type: "reps",
      load_type: "assisted", load_value: -25, per_side: false, notes?: "" },
    { exercise: "chin-ups",  metric: 5, load_type: "added", load_value: 10 }
  ]
})
```

### Exercise name-matching (inside the core)

1. Normalize → match against `canonical_name` + `aliases`.
2. Exact/alias hit → use it.
3. Close fuzzy hit (e.g. "chins" → "Chin-ups") → use it **and echo the resolution** so a wrong
   match can be caught.
4. No confident match → return `needs_confirmation` with the unmatched name + nearest
   candidates. The tool **does not invent an exercise silently**; Claude asks the user
   ("new exercise 'X', or did you mean 'Y'?") before committing. Keeps the registry from
   filling with `pull-up` / `pullup` / `pull up` triplets.

### Reply (the feedback that makes it feel alive)

```
✅ Logged — Upper / Strength, 12 Jun
  • Muscle-up   5 @ -25kg   ⬆ PR (ladder: -35 → -25, ~10kg to bodyweight)
  • Chin-ups    5 @ +10kg   ✓ matches best
  • Dips        8 @ +10kg   ↓ off your best (8 @ +10 on 31 May)
  ⚠ 'russian dips' — new exercise, confirm before I save it
```
PR / ⬆ / ↓ flags come from `v_prs`; the ladder note from the assisted-load trend.

## Doors & auth

- **Phone — remote MCP server** (`/api/mcp`), built with Vercel's Next.js MCP adapter
  (`mcp-handler`), added to the Claude app as a **custom connector** (web + mobile, paid
  plans). Gym flow: open Claude → dictate → `log_workout` → PR/ladder reply.
- **Laptop — Claude Code skill** `workout-log` in `~/.claude/skills/`, mirrors the CRM skills;
  `curl`s the HTTP API. For end-of-session dumps and "how am I trending."
- **Auth:**
  - MCP connector → **OAuth** (Claude.ai custom connectors authenticate via OAuth; the Vercel
    MCP adapter supports it), single-user.
  - Code skill → **bearer token** in `.env.local`, same pattern as crm-app secrets.
  - Reads (dashboard) → no auth; private Vercel deploy.

**Verify-at-build flag:** the exact connector-auth mechanism (OAuth scopes / whether a simpler
personal-connector token path is currently permitted) is confirmed against current Anthropic
connector docs during implementation, consulting the `claude-api` reference. The design is
unaffected either way; only the auth wiring is.

## Dashboard (read-only)

Plain Next.js pages reading Neon, mobile-readable:

- **Muscle-up ladder** (hero) — single line `assisted → 0 → added` over time, with a thin
  projection to the December target. Answers "am I on track for the goal?"
- **Per-exercise progression** — pick an exercise → best-set load and reps over time.
- **Stalled lifts** — computed list: no load/rep improvement over the last N sessions. Feeds
  the generator's deload decisions.
- **PR board** — the live `v_prs` view, replacing the Notion table.
- **Recent sessions** — reverse-chronological list, so the app can fully retire the Notion log
  as the human-readable record too.

Charting: a lightweight chart dependency; no heavy BI.

## Testing / verification

- **Core unit tests:** name-matching (exact / alias / fuzzy / needs_confirmation), load-type
  handling for all four types, idempotent overwrite on `(session_id, exercise_id)`, PR
  detection across load and metric.
- **API tests:** `POST /api/log` happy path + validation failures + auth.
- **Schema:** `npm run db:schema` applies `schema.sql` cleanly to a fresh DB.
- **Dashboard:** Playwright smoke (mirrors crm-app) — ladder + progression render from seeded data.

## Out of scope (YAGNI)

- Per-set arrays and RPE (summary-per-exercise only).
- Server-side LLM parsing (Claude parses; add only if a non-Claude door is introduced).
- Plan/prescription storage or matching.
- Wearable / recovery-data fusion.
- Telegram / iOS Shortcut doors (the HTTP contract leaves room to add them later).
- Multi-user / sharing.
