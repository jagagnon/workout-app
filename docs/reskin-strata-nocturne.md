# Reskin: Strata Nocturne

Retheme the app from the current orange/graphite "drafting" look to **Strata Nocturne**:
a stack of indigo plates, each with a machined lip catching light from a single source.

The palette keeps a **warm burnt orange as the accent** — the work done: load lifted, upper
days, the ladder trace — against a cool **periwinkle counterpoint** for the goal not yet
reached: the bodyweight threshold line, assist figures, lower days. Orange leads; the
periwinkle recedes. Do not let the cool colour out-shout the warm one.

Reference build (the target, with real data):
https://claude.ai/code/artifact/2b8a3e8b-f1b5-4f9d-a4a2-159c0af09db9

**Read `AGENTS.md` first.** This is not the Next.js in your training data — check
`node_modules/next/dist/docs/` before writing framework code. This job is almost entirely
CSS and should not need any.

## Execution rules

- Phases are **sequential and independently shippable**. Finish and verify one before
  starting the next. Do not batch them into a single commit.
- Every phase ends with the same gate:
  ```bash
  node node_modules/typescript/lib/tsc.js --noEmit 2>&1 | grep -v 'tests/dashboard.spec.ts'
  npm test
  ```
  `tsc` must be clean except pre-existing `tests/dashboard.spec.ts` errors (Playwright is
  not installed — ignore those and only those). All **71 tests** must pass. `npx tsc` is
  broken in this repo (bad bin shim); use the explicit `node node_modules/...` path above.
- Commit per phase, push to `master`. Vercel auto-deploys — that is expected, not a mistake.
- **Do not touch** `src/lib/`, `src/db/`, `src/app/api/`, or any `tests/`. This is a visual
  change only. If a phase seems to require a logic change, stop and report instead.

---

## Mobile is the primary target, not a final check

This app is used **one-handed, mid-set, on a phone, in a gym**. `/log` especially: it is
open between working sets while Julien is holding a bell. A layout that only resolves on a
laptop is a failed job, however good the desktop looks.

The current CSS has **one media query in 997 lines** (`@media (max-width: 680px)` at line
314, which collapses `.grid` to a single column). Everything else survives on fluid luck
inside a 900px column. **Phase 2 removes that column** in favour of full-bleed bands, and
Phase 1 swaps in a display face 30-40% wider. Both changes land hardest on small screens,
so mobile is verified at the end of *every* phase, not once at the end.

### How to look at it

A launch config already exists. Start the dev server and drive it:

```
preview_start  name: "workout-app"
resize_window  preset: "mobile"      # 375x812
resize_window  width: 360, height: 740
resize_window  preset: "desktop"     # reset when done
```

Screenshots from a hidden browser pane can come back blank or stale. If a screenshot looks
empty, do not conclude the page is broken — confirm with `read_page`, or check geometry
directly before believing it:

```js
document.documentElement.scrollWidth <= window.innerWidth   // must be true: no h-scroll
```

### The four gates, checked at every phase

Run at **360x740** (small Android, the tightest realistic case) and **390x844** (iPhone
14/15). Both must pass:

1. **No horizontal scroll.** `document.documentElement.scrollWidth <= window.innerWidth`.
   This is the one that silently breaks; check it, don't eyeball it.
2. **No text below 12px** on anything read mid-set — set values, loads, rep counts. Labels
   and axis ticks may go to 10px.
3. **Tap targets >= 44x44px** for anything pressed during a session: the skip button, the
   total/each-side toggle, load and rep inputs, the save control.
4. **No hover-only affordances.** There is no hover on a phone. `.pr-row:hover` and
   `.pr-name:hover` are decorative and fine; anything that *reveals information or an
   action* on hover must also be visible or reachable by tap.

### Viewport meta

Next injects a default `width=device-width, initial-scale=1` and `src/app/layout.tsx` does
not override it. **Verify this is still true in this Next version** before assuming it —
check `node_modules/next/dist/docs/` per `AGENTS.md`. If the rendered `<head>` has no
viewport tag, export a `viewport` object from `layout.tsx`. Everything else in this
document is worthless if the page renders at 980px CSS pixels and scales down.

---

## Phase 1 — Tokens and type

One block plus seven hardcoded escapees. After this the whole app is indigo and set in the
new faces, with the card structure otherwise intact. Fully reversible; ship it and look at
it before going further.

**Note on `--radius`:** the table below drops it from 14px to 2px, which squares off `.card`
and `.log-card` immediately, since both read `border-radius: var(--radius)`. That is
intentional and lands in Phase 1, not Phase 2 — it means the cards are near-square while
they still carry the corner-tick motif and the card gradient, which looks slightly
incoherent until Phase 2 finishes the job. Do not "fix" this in Phase 1 and do not treat it
as a reason to skip the token change.

### 1a. Replace the `:root` block in `src/app/globals.css` (lines 1–29)

| Token | From | To |
|---|---|---|
| `--bg` | `#08080a` | `#0b0e18` |
| `--bg-2` | `#0f0f13` | `#0b0e18` |
| `--surface` | `#141419` | `#141930` |
| `--surface-2` | `#1a1a21` | `#1a2039` |
| `--line` | `#23232c` | `#242b48` |
| `--line-bright` | `#35353f` | `#37406b` |
| `--text` | `#efeadd` | `#eef0f8` |
| `--text-dim` | `#9a958b` | `#8a93b2` |
| `--text-faint` | `#5f5b54` | `#5b6486` |
| `--accent` | `#ff5a1f` | `#d9703f` |
| `--accent-hi` | `#ff7a42` | `#ea8354` |
| `--accent-deep` | `#e23c00` | `#b0562c` |
| `--accent-soft` | `rgba(255,90,31,.12)` | `rgba(217,112,63,.12)` |
| `--accent-glow` | `rgba(255,90,31,.5)` | `rgba(217,112,63,.45)` |
| `--ref` | `#6fd0e6` | `#8c9bff` |
| `--good` | `#8bd17c` | `#7fd1a8` |
| `--radius` | `14px` | `2px` |
| `--font-display` | `"Anton"` | `"Fraunces", Georgia, serif` |
| `--font-body` | `"Archivo"` | `"Karla", system-ui, sans-serif` |
| `--font-mono` | `"JetBrains Mono"` | `"Space Mono", ui-monospace, monospace` |

Add two new tokens — the plate lip, and the cool counterpoint as a solid fill:
```css
--lip: rgba(140, 155, 255, 0.16);   /* cool light on the machined edge */
--ref-fill: #6b78cc;                /* --ref dropped in chroma, for solid fills */
```

The lip stays **cool** even though the accent is warm: it reads as light on steel, and
keeping it cool means the burnt orange is the only warm thing on the page. That is
deliberate — do not warm it to "match" the accent.

`--ref` at full brightness is fine as a thin line (the bodyweight threshold) or as small
text (assist figures). As a **solid fill** it out-shouts the accent, so lower-body calendar
cells and any other filled block use `--ref-fill`.

Replace `--shadow-card` entirely. Plates are not floating cards — they are stacked slabs
lit from above, so the drop shadow goes and only the lip remains:
```css
--shadow-card: inset 0 1px 0 var(--lip);
```

### 1b. Fix the seven hardcoded sites that bypass tokens

These are the trap in this phase — a find-and-replace on `:root` alone leaves orange
bleeding through in seven places.

| Line | Current | Change to |
|---|---|---|
| 41 | `rgba(255, 90, 31, 0.11)` in `body` radial-gradient | `rgba(217, 112, 63, 0.13)` |
| 42 | `rgba(255, 90, 31, 0.04)` in `body` radial-gradient | `rgba(217, 112, 63, 0.04)` |
| 76 | `::selection { ... color: #0a0a0c }` | `color: var(--bg)` |
| 266 | `drop-shadow(... rgba(255, 90, 31, 0.25))` | `rgba(217, 112, 63, 0.25)` |
| 440 | `.tag.u { border-color: rgba(255, 90, 31, 0.4) }` | `rgba(217, 112, 63, 0.4)` |
| 546 | `border-color: rgba(255, 90, 31, 0.4)` | `rgba(217, 112, 63, 0.4)` |
| 926 | `color: #0a0a0c` | `var(--bg)` |

Verify none remain:
```bash
grep -n '255, *90, *31\|#ff5a1f\|#0a0a0c\|#6fd0e6' src/app/globals.css
```
Must return nothing. Note this greps the **old** orange `#ff5a1f` / `rgba(255,90,31,...)`;
the new accent `#d9703f` is a different, deeper burnt orange and is expected to appear.

**Do not skip this step because "the accent is still orange."** The new burnt orange is a
distinct value and every one of these seven sites must move to it — a half-migrated palette
with two oranges in it is worse than either one alone.

### 1c. Swap the fonts in `src/app/layout.tsx`

Replace the `next/font/google` imports. Anton/Archivo/JetBrains_Mono become
Fraunces/Karla/Space_Mono, keeping the same `variable` names so the CSS is untouched:

```ts
import { Fraunces, Karla, Space_Mono } from "next/font/google";

const display = Fraunces({ subsets: ["latin"], variable: "--font-display" });
const body = Karla({ subsets: ["latin"], variable: "--font-body" });
const mono = Space_Mono({ weight: ["400", "700"], subsets: ["latin"], variable: "--font-mono" });
```

`Space_Mono` has no variable axis and **requires an explicit `weight`** — omitting it is a
build error. `Fraunces` is variable and must not be given a `weight`.

### 1d. Fix the display-face metrics

**This is the one judgment call in Phase 1, and it is not optional.** Anton is
ultra-condensed; Fraunces is a normal-width serif. Every headline set in `--font-display`
will grow roughly 30–40% wider and will wrap or overflow where it did not before.

Check `.wordmark` (`src/app/globals.css`) and any `--font-display` rule with a `font-size`
above 28px. Reduce sizes until nothing wraps mid-word at 390px and 1280px viewport widths.
Add `text-wrap: balance` to headings. In the reference build the h1 is
`clamp(42px, 7.4vw, 84px)` with `line-height: .98` and `letter-spacing: -.022em` — use that
as the starting point for `.wordmark`.

**The topbar is the highest-risk regression in this whole job.** `.topbar` (line 98) is
`display: flex; justify-content: space-between` with **no `flex-wrap`**, holding the
wordmark and the days-to-goal countdown side by side. `.wordmark` is
`clamp(32px, 7.4vw, 56px)` — sized for Anton, which is ultra-condensed. In Fraunces the
same clamp is ~35% wider and the row cannot wrap, so at 390px the countdown gets crushed or
the row overflows the viewport.

Fix it in this phase, not later: add `flex-wrap: wrap` to `.topbar`, and drop the
`.wordmark` clamp minimum (try `clamp(26px, 6.4vw, 52px)`). Verify at 360px that the
wordmark and the countdown either sit on one line comfortably or stack cleanly — never
overlap, never clip.

**Done when:** app builds, gate passes, no orange anywhere, no headline wraps mid-word,
and the four mobile gates pass at 360px and 390px on `/`.

---

## Phase 2 — Cards become plates

The only phase needing real design judgment. Everything else is mechanical.

### 2a. `.card` (globals.css line 184) becomes a plate

Currently: rounded, bordered, gradient-filled, drop-shadowed, with drafting registration
ticks in two corners. Target: a square slab with a lit top edge.

```css
.card {
  position: relative;
  background: var(--surface);
  border: none;
  border-top: 1px solid var(--line);
  border-radius: 0;
  padding: 22px;
  overflow: hidden;
  box-shadow: var(--shadow-card);
}
```

Phase 1 already set `--radius: 2px`, so the cards arrive here nearly square. Setting
`border-radius: 0` explicitly here is still correct — plates have no radius at all, and
`--radius` stays at 2px for the small controls that should keep a hint of one.

**Delete `.card::before` and `.card::after` entirely** (globals.css lines 195–214, the
corner ticks). They are the signature motif of the *old* direction and read as noise
against a plate. Removing them is intended, not an oversight.

**`--bg` and `--bg-2` are deliberately the same value** (`#0b0e18`). This is not a typo in
the token table. The stack alternates between `--surface` (the raised plate face) and the
night ground; it does not need two distinct dark tones, and the alternation in 2b below
depends on them being identical.

### 2b. Alternate the plates

Plates read as a stack only if consecutive ones differ. Add:
```css
.card:nth-of-type(even) { background: var(--bg-2); }
```
Check the result on `/` — if the alternation fights the `.grid` layout (two cards side by
side in one row getting different grounds looks wrong), scope it to full-width cards only
via `.card.span2`.

### 2c. Remove the blueprint grid, keep the grain

`body::before` (lines 51–62) is a 46px blueprint grid that existed to anchor the corner
ticks. The ticks are gone, so **delete `body::before`**.

**Keep `body::after`** (the film grain, lines 64–72). It reads as surface texture on the
plates and belongs in this direction. Do not remove it.

### 2d. Full-bleed bands

`.wrap` (line 89) is `max-width: 900px` with the cards inset. In Strata the plates run edge
to edge and only their *contents* are constrained.

Restructure so `.card` is full-bleed and an inner container holds the max-width. **Beware
the cascade collision** — this exact bug was hit building the reference: if the inner
container sets horizontal padding via a `padding` shorthand and a section class later sets
`padding: 40px 0 44px`, the shorthand wipes the horizontal padding and content runs to the
viewport edge. **Use `padding-top` / `padding-bottom` longhands on any class that shares an
element with the width container.**

### 2e. Full-bleed plates on a phone

Full-bleed is the one structural change that can *improve* mobile — edge-to-edge plates use
the whole screen instead of wasting 22px of gutter each side. Make sure it actually does:

- The plate itself goes edge to edge; its **inner container keeps its horizontal padding**
  so text never touches the bezel. At 360px use no less than 16px inner padding.
- Check the `.grid` breakpoint at line 314 still makes sense. With plates rather than
  cards, two-up at 680px+ may want to become full-width sooner — if a two-column row of
  plates looks cramped at 700px, raise the breakpoint.
- `overflow-x: hidden` on `body` (line 46) currently **hides** horizontal overflow rather
  than preventing it. Do not treat it as proof there is none — check `scrollWidth`
  directly, or a real overflow will be invisible until it clips content.

### 2f. The hero hairline

`.hero::after` (line 239) is a horizontal accent gradient across the hero's top edge. Keep
it — it now reads as the light source above the stack. It picks up `--accent` from tokens
automatically; no edit needed. Confirm it still looks intentional against the lip.

**Done when:** gate passes; `/` renders as stacked plates with no rounded corners, no drop
shadows, no corner ticks; the four mobile gates pass at 360px and 390px.

---

## Phase 3 — Charts

Mechanical. 22 literals across 3 files, only 6 distinct values.

Recharts passes these straight through as SVG attributes, and SVG accepts `var()` in
`fill`/`stroke`, so replace literals with tokens rather than new hex values. This makes the
*next* retheme free.

| Literal | Occurrences | Replace with |
|---|---|---|
| `#ff5a1f` | 11 | `var(--accent)` |
| `#0a0a0c` | 5 | `var(--bg)` |
| `#3a3a47` | 3 | `var(--line-bright)` |
| `#26262f` | 2 | `var(--line)` |
| `#6fd0e6` | 2 | `var(--ref)` — the bodyweight line, now periwinkle |
| `#8a8a99` | 1 | `var(--text-dim)` |

Files: `src/app/components/LadderChart.tsx` (10), `Sparkline.tsx` (5),
`StimulusProgressionChart.tsx` (7).

**Two exceptions where `var()` will not work.** `<stop stopColor>` inside `<linearGradient>`
and `<LabelList fill>` are read by Recharts before paint in some builds. Do these two, then
load `/` in a browser and confirm the ladder chart's area fill and the rep labels still
render. If either turns black or vanishes, put a literal `#8c9bff` back for that one prop
and leave a comment saying why.

Verify none remain:
```bash
grep -rn '#[0-9a-fA-F]\{3,6\}' src/app/components/
```

**Done when:** gate passes, `/` and `/exercise/[id]` charts render in periwinkle with a
coral bodyweight reference line, and the four mobile gates pass.

Charts are a common source of horizontal overflow: Recharts `ResponsiveContainer` sizes to
its parent, so a parent with fixed padding plus a min-width child can push past the
viewport. Check `scrollWidth` on both routes at 360px specifically.

---

## Phase 4 — Remaining routes

Bulk but repetitive. Most of it inherits from Phases 1–3 automatically; this phase is
finding what did not.

Walk each route and fix what looks wrong. In this order:

1. `/prs` — `src/app/prs/page.tsx` (23 lines) + `.pr-*` and dumbbell-chart CSS
   (globals.css 318–369, 566–676). Thin, mostly inherits. **Mobile trap:** `.pr-name`
   (line 621) is `width: 150px; flex-shrink: 0` — a hard column. At 360px that leaves
   ~150px for load and reps, and Space Mono is wider than JetBrains Mono at the same size.
   Change to `flex: 1 1 auto; min-width: 0` with the numeric columns fixed instead, or
   reduce to `width: 40%`.
2. `/sessions` — `src/app/sessions/page.tsx` (64 lines) + CSS 370–449 and the calendar
   450–526. Check the `.tag.u` / `.tag.l` region pills read as burnt orange (upper)
   and periwinkle (lower), matching the reference build's semantics. If the lower pill is
   a solid fill rather than an outline, use `--ref-fill`, not `--ref`.
3. `/exercise/[id]` — 62 lines + stimulus tabs (CSS 527–549).
4. **`/log` last.** `src/app/log/LogForm.tsx` is 558 lines with its own dense sub-system
   (CSS 733–997: pills, toggles, per-set rows, the skip control). This is the surface used
   mid-workout between working sets — it is the only place a styling regression actually
   costs something. Do it with the test suite already green on everything else.

   **`/log` gets the strictest mobile pass of any route.** It is operated one-handed while
   holding a weight. Specifically:
   - `.log-field` (line 817) is `flex: 1; min-width: 78px`. Several fields in a row at
     360px will overflow. Verify the set row wraps or shrinks rather than pushing wide.
   - The load/rep inputs, the skip button and the `total` / `each side` toggle must all
     clear 44x44px. The toggle in particular is currently sized like a text label.
   - `.log-overlay .card` (line 962) is `max-width: 320px` — confirm it still centres and
     does not touch the bezel at 360px.
   - Numbers entered mid-set must not drop below 14px. This is the one screen where
     legibility beats density.

In the logger CSS, the radius values at lines 762–988 are all `10px`/`12px` pills. Square
them to `2px` for consistency with the plates, **except** `.cal-dot` (line 501) and the two
`border-radius: 50%` circles at 633/655, which are meant to be round.

**Done when:** gate passes; all four routes walked at **360px, 390px, 768px and 1280px**;
no orange, no rounded plates, no horizontal scroll at any width; all four mobile gates pass
on every route.

---

## Phase 5 — Final verification

```bash
node node_modules/typescript/lib/tsc.js --noEmit 2>&1 | grep -v 'tests/dashboard.spec.ts'
npm test
grep -rn '255, *90, *31\|#ff5a1f\|#6fd0e6\|Anton\|Archivo\|JetBrains' src/
```

The last grep should return nothing.

Then walk all four routes at **360x740** and **390x844** one final time, confirming on each:

```js
document.documentElement.scrollWidth <= window.innerWidth
```

Reset the viewport (`resize_window preset: "desktop"`) when finished. Then confirm the
Vercel deploy reached READY.

## Known traps, collected

1. `npx tsc` is broken — use `node node_modules/typescript/lib/tsc.js --noEmit`.
2. `tests/dashboard.spec.ts` errors are pre-existing. Filter them; do not "fix" them.
3. Seven hardcoded orange values in `globals.css` bypass the tokens (Phase 1b).
4. `Space_Mono` needs an explicit `weight`; `Fraunces` must not have one.
5. Anton to Fraunces widens every headline by 30–40% (Phase 1d).
6. `padding` shorthand on a shared element wipes the width container's horizontal padding
   (Phase 2d).
7. Recharts gradient `stopColor` and `LabelList fill` may not accept `var()` (Phase 3).
8. `--good` (`#7fd1a8`) is a mint that exists only for semantic success states. It is not
   part of the two-colour accent system and must not be used decoratively.
9. `.topbar` has no `flex-wrap` and `.wordmark`'s clamp was sized for a condensed face —
   the countdown overflows on a phone after the font swap (Phase 1d).
10. `overflow-x: hidden` on `body` hides overflow instead of preventing it. Never treat the
   absence of a visible scrollbar as proof; check `scrollWidth` (Phase 2e).
11. `.pr-name` has a hard `width: 150px` and `.log-field` a `min-width: 78px` — both are
    fixed pixels in flex rows and both bite at 360px (Phase 4).
12. Browser-pane screenshots can return blank or stale frames. Verify geometry in JS before
    concluding a page is broken.
