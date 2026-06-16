# Workout Plan Store — Phase 2 Design

**Date:** 2026-06-16
**Status:** Approved (design), pending spec review

## Problem

The chat-mode `workout-generator` reads its programming intelligence from a single Notion "Workout log" page — ~33 sessions of full prescriptions (warm-ups, every A1/B2/… block with sets×reps, stimulus label), growing forever. The generator **fetches the whole page every generation**. That is the "heavy heavy": an unbounded full-page read to use only the most recent few sessions.

Retiring it naively (dropping the variety rules) is not an option: without enforced rotation, the LLM converges on its modal output and reproduces near-identical sessions, which drives adaptation and stalls training. The variety enforcement is valuable and must stay.

## Decision

Replace the Notion Workout log with a **queryable Neon `plan` table**. The generator writes each session's plan there at design time and reads back **only the last 3–4 same-region sessions** — a bounded query, not a whole-page fetch. All programming intelligence stays (stimulus rotation, variety enforcement across main-block variations + accessories + MU drill, MU-progression). The Notion log page is retired (left in place, no longer written).

This is **Phase 2**; Phase 1 (PR/actuals unification onto Neon) is complete.

### Naming
The planned session is a **plan** (vs the existing `session` = actuals / what was done). Table `plan`; MCP tools `log_plan`, `get_recent_plans`.

### Lookback window (why 3–4, not more)
- The old rule looked back only the **last 2** same-type sessions — which an A/B/A/B alternation defeats (each session looks "different from last" while only two templates cycle).
- Variety and MU-progression now check the **last 3** same-type sessions; the read fetches the **last 4 same-region** (small buffer).
- Looking back further is overkill: beyond ~4 same-type sessions (~1.5+ weeks at 3× Upper/week), a movement is a fresh stimulus again and *should* be reusable to track progression. Constraining against older history just drains the exercise pool with no adaptive benefit.

## Data flow (after Phase 2)

| Store | Holds | Written by | Read by |
|---|---|---|---|
| Neon `plan` | programmed session (date, region, stimulus, exercise blocks) | generator at design time via `log_plan` | generator via `get_recent_plans` (last 4, by region) |
| Neon actuals (`session`/`entry`, existing) | what was done + derived PRs | `log_workout` | dashboard, ladder |
| ~~Notion Workout log~~ | — | **retired** (page left, no longer written) | — |

`plan` (intended) and `session`/`entry` (actuals) stay separate concerns — different lifecycle (design-time vs post-workout), no FK coupling in this phase.

## Components

### 1. `plan` table

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

- `body` is the existing verbatim block: the `W: … / A1: … | A2: … / … / F: …` lines. Stored as text, **not** normalized into per-exercise rows — variety is judged by the LLM reading recent blocks, not by SQL, so normalization buys nothing and costs build/maintenance.
- `unique (date, region)` makes writes idempotent (re-finalizing the same day's plan upserts).
- `stimulus` nullable for Lower days (which carry no `S:` label), matching the current log convention.

### 2. MCP tools (auto-exposed to the connector after deploy)

- **`log_plan`** — params: `date?` (default today, Europe/Zurich), `region` (`U`|`L`), `stimulus?`, `body`. Upserts on `(date, region)`. Returns the written row.
- **`get_recent_plans`** — params: `region` (`U`|`L`), `limit?` (default 4). Returns the last N plans for that region, newest first: `{date, region, stimulus, body}`.

Both wrap thin lib functions in `src/lib/plans.ts`, mirroring the existing `log-workout.ts` / `progress.ts` patterns. Added to `src/app/api/mcp/route.ts` alongside the existing three tools; bearer-guarded `/api/plan` + `/api/plans` HTTP routes added for parity with `/api/log` (so the Claude Code path can use them too).

### 3. Generator skill repoint (`workout-generator` SKILL.md)

- **Data to fetch:** replace row 4 ("Workout log → Fetch Notion page …") with "Recent plans → call `get_recent_plans` (region, last 4)".
- **Stimulus rotation:** read the `stimulus` of recent plans (was: Notion `S:` labels).
- **Variety — updated rule:** check against the **last 3** same-region plans (was last 2). Enforce:
  - **Main block:** core *patterns* recur every session (a vertical pull, a dip/push), but the specific *variation* must rotate vs the last 3 (e.g. weighted pull-ups → chin-ups → chest-to-bar — not the same flavour twice running).
  - **Accessories/correctives:** ≥ half must differ from the last 3 same-type sessions.
  - **MU drill:** rotates (as today).
  - **Warm-ups:** the two mandatory slots stay; rotate the other two vs recent.
- **MU-progression:** read the MU drill from the last 3 upper plans.
- **LOG SESSION:** replace "Prepend to Notion Workout log via `notion-update-page`" with "call `log_plan` (region, stimulus, body)". Keep the exact `W/A1/…/F` body format. Drop the Notion log URL.
- **Gym-wifi:** if `get_recent_plans` fails, fall back to asking Julien his last 1–2 same-type sessions (existing pattern); `log_plan` is the write that should land.

(Re-upload the generator skill bundle to the Claude app, as in Phase 1.)

### 4. Seed recent history

Import the **last 4 Upper + last 2 Lower** session blocks from the current Notion Workout log into the `plan` table (parsed from the page content already retrieved), so the variety/rotation rules have history from session one — no cold-start. Full 33-session import is unnecessary; nothing looks back beyond 3.

### 5. Retire the Notion Workout log

Leave the page in place; the generator no longer reads or writes it. (Same treatment as the retired Notion PR table.)

## Error handling / dependencies
- New MCP tools require an app **deploy** (auto-deploy on push). The connector picks up new tools automatically via `tools/list` — no re-add needed.
- Generator skill bundle must be **re-uploaded** to the Claude app for the repoint to take effect.
- `get_recent_plans` / `log_plan` are network calls; degrade gracefully (above).
- Idempotency: `unique (date, region)` on `plan`.

## Verification
1. `log_plan` then `get_recent_plans` round-trips the body for the right region, newest-first, bounded by limit.
2. Seeded rows return correctly (last 4 Upper, last 2 Lower).
3. A generated Upper session reads recent plans, rotates the main-block variation + accessories vs the last 3, and writes its plan back.
4. Notion Workout log no longer written.

## Out of scope
- Normalizing plan bodies into per-exercise rows / analytics on planned volume.
- Linking `plan` rows to actuals `session` rows (cross-referencing plan vs performed).
- Any change to the actuals/PR path from Phase 1.
