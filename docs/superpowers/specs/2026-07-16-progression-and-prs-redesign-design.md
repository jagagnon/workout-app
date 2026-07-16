# Progression Chart + All-Exercise PRs — Design

**Date:** 2026-07-16
**Status:** Approved (design), pending spec review

## Problem

The per-exercise page (`/exercise/[id]`) plots every logged session for a lift on one continuous dual-axis line (reps + load), regardless of session `type` (stimulus: Strength/Hypertrophy/Volume). Since Julien mixes stimulus, reps, and weights across sessions for the same lift, the line zigzags with every stimulus switch instead of showing a coherent trend — unlike the muscle-up ladder, where every point is the same kind of thing (assist load at a fixed low rep). The chart isn't useful to look at.

Separately, the dashboard's PR Board only surfaces exercises flagged `is_key` — there's no way to see PRs (start vs. current) across the full exercise roster.

## Decision

1. Split the per-exercise progression view by stimulus type (tabs), plotting load only per tab.
2. Add a new `/prs` page showing every tracked exercise as a start→current PR "dumbbell" (two dots + connecting line), grouped by load type so incompatible units/directions aren't compared on one axis.

### Settled choices
- **Layout:** tabs (Strength / Hypertrophy / Volume / Other), not stacked small multiples — one chart area, switch stimulus via tab.
- **Chart content per tab:** load only, no dual-axis reps line (reps are ~fixed within a stimulus for Julien; load is the real signal, same philosophy as [[feedback_training_submaximal]]).
- **PRs page:** separate page (`/prs`), not a modification of the existing key-lifts PR Board — that stays as-is.
- **Dumbbell chart:** one row per exercise, grouped into three sections by load type (Assisted / Added+External / Bodyweight-reps), each section with its own axis scale so kg-assist, kg-added, and rep-max numbers are never compared directly.
- **Start value:** first-ever logged entry for that exercise (chronologically), which for most lifts is the Notion baseline import row already in the DB.
- **Current value:** existing PR logic (`v_prs`: max for added/external, max(load_value) for assisted meaning least assist, max metric for bodyweight).

## Components

### 1. `exerciseProgression()` — add stimulus type

`src/lib/progress.ts`: add `s.type as stimulus` to the existing select in `exerciseProgression`. No new query needed, just one more column.

```sql
select s.date, s.type as stimulus, e.metric_value, e.metric_type, e.load_type, e.load_value, e.load_unit, e.per_side
from entry e
join session s on s.id = e.session_id
join exercise x on x.id = e.exercise_id
where x.canonical_name = ${canonicalName}
order by s.date asc
```

### 2. `StimulusProgressionChart` (replaces `ProgressionChart` on the exercise page)

New component, same file location pattern as `LadderChart`/`ProgressionChart`. Props: `data: { label: string; kg: number; stimulus: string | null }[]`.

- Group data client-side (in the page or the component) by `stimulus` (`Strength`, `Hypertrophy`, `Volume`, and `null`/unrecognized → `"Other"`).
- Render a tab strip with only the stimulus types that have ≥1 data point for this exercise.
- Default active tab = the stimulus type of the most recent entry.
- Each tab renders a single-line load chart, visually modeled on `LadderChart` (area+line, no dual axis) rather than the current `ComposedChart`.
- Empty state unchanged in spirit: "No sessions logged for this lift yet" if there's no data at all.

`ProgressionChart.tsx` is deleted (fully replaced, not kept side by side) since nothing else uses it.

### 3. `exercise/[id]/page.tsx` update

Map the new `stimulus` field through, pass to `StimulusProgressionChart` instead of `ProgressionChart`. Card title changes from "Progression · reps & load" to "Progression · load by stimulus".

### 4. `allExercisePrs()` — new query

`src/lib/progress.ts`, new function returning, per exercise, load_type-appropriate start + current:

```sql
with first_entry as (
  select distinct on (e.exercise_id)
    e.exercise_id, e.load_type, e.load_value, e.metric_value
  from entry e
  join session s on s.id = e.session_id
  order by e.exercise_id, s.date asc, e.id asc
)
select
  x.id as exercise_id, x.canonical_name,
  f.load_type as start_load_type, f.load_value as start_load_value, f.metric_value as start_metric,
  p.max_added_load, p.min_assist_load, p.max_metric
from exercise x
join first_entry f on f.exercise_id = x.id
left join v_prs p on p.exercise_id = x.id
order by x.canonical_name
```

Bucketing logic (in TS, not SQL) per row, based on `start_load_type` / which `v_prs` column is non-null:
- `start_load_type = 'assisted'` → **Assisted** section, start = `start_load_value`, current = `min_assist_load`.
- `start_load_type in ('added','external')` → **Added/External** section, start = `start_load_value`, current = `max_added_load`.
- `start_load_type = 'bodyweight'` → **Bodyweight reps** section, start = `start_metric`, current = `max_metric`.

Exercises with only one logged entry still show (start == current, a flat/zero-length dumbbell) — no filtering out.

### 5. `PrDumbbellChart` component + `/prs` page

New component rendering three sections (only sections with ≥1 exercise render), each a list of rows: exercise name, a horizontal track scaled to that section's own min/max, two dots (start, current) connected by a line, value labels at each dot. Direction-aware: for Assisted, "improvement" visually reads left (less assist); for Added/External and Bodyweight, right (more).

Built as plain positioned divs/SVG (like `StalledList`), not forced through recharts — recharts has no native dumbbell/lollipop mark and this is simpler as direct layout.

New route `src/app/prs/page.tsx`, server component following the existing page pattern (`dynamic = "force-dynamic"`, fetch via `progress.ts`, render header + sections). Add a nav link to `/prs` from the dashboard (near the PR Board card title, e.g. "All PRs →").

## Data flow

Both features are read-only additions on existing tables — no schema changes, no writes. `exerciseProgression` and the new `allExercisePrs` both read `entry`/`session`/`exercise`/`v_prs`, nothing new to migrate.

## Error handling / dependencies

- No schema changes — pure query + UI additions, ships via the existing GitHub→Vercel auto-deploy on push to `master`.
- Exercises with zero logged entries don't appear in `allExercisePrs` (inner join on `first_entry`) — expected, nothing to show.
- Existing `/exercise/[id]` empty state (no sessions at all) unchanged.

## Verification

1. An exercise logged under two stimulus types shows two tabs, each a clean single-line load trend (no zigzag across stimulus switches).
2. An exercise logged under only one stimulus type shows one tab, no empty tabs rendered.
3. `/prs` shows every tracked exercise (not just `is_key`), correctly bucketed into Assisted / Added+External / Bodyweight-reps, each section's axis independent of the others.
4. An exercise with exactly one logged entry renders a flat (zero-movement) dumbbell rather than erroring.
5. Existing dashboard PR Board (key lifts) and muscle-up ladder are unaffected.

## Out of scope

- Changing the dashboard's existing PR Board (key lifts table) — untouched.
- Normalizing/estimating across load types (no % change, no e1RM — ruled out per [[feedback_training_submaximal]]).
- Any schema or write-path changes (`log_workout`, `add_exercise` untouched).
