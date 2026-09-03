# Reskin: Strata Nocturne

Retheme the app from the current orange/graphite "drafting" look to **Strata Nocturne**:
a stack of indigo plates, each with a machined lip catching light from a single source.

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

## Phase 1 — Tokens and type

One block plus seven hardcoded escapees. After this the whole app is indigo but still
card-shaped. Fully reversible; ship it and look at it before going further.

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
| `--accent` | `#ff5a1f` | `#8c9bff` |
| `--accent-hi` | `#ff7a42` | `#a8b3ff` |
| `--accent-deep` | `#e23c00` | `#6b7ae8` |
| `--accent-soft` | `rgba(255,90,31,.12)` | `rgba(140,155,255,.12)` |
| `--accent-glow` | `rgba(255,90,31,.5)` | `rgba(140,155,255,.5)` |
| `--ref` | `#6fd0e6` | `#ff9e7a` |
| `--good` | `#8bd17c` | `#7fd1a8` |
| `--radius` | `14px` | `2px` |
| `--font-display` | `"Anton"` | `"Fraunces", Georgia, serif` |
| `--font-body` | `"Archivo"` | `"Karla", system-ui, sans-serif` |
| `--font-mono` | `"JetBrains Mono"` | `"Space Mono", ui-monospace, monospace` |

Add one new token for the plate lip:
```css
--lip: rgba(140, 155, 255, 0.16);
```

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
| 41 | `rgba(255, 90, 31, 0.11)` in `body` radial-gradient | `rgba(140, 155, 255, 0.13)` |
| 42 | `rgba(255, 90, 31, 0.04)` in `body` radial-gradient | `rgba(140, 155, 255, 0.04)` |
| 76 | `::selection { ... color: #0a0a0c }` | `color: var(--bg)` |
| 266 | `drop-shadow(... rgba(255, 90, 31, 0.25))` | `rgba(140, 155, 255, 0.25)` |
| 440 | `.tag.u { border-color: rgba(255, 90, 31, 0.4) }` | `rgba(140, 155, 255, 0.4)` |
| 546 | `border-color: rgba(255, 90, 31, 0.4)` | `rgba(140, 155, 255, 0.4)` |
| 926 | `color: #0a0a0c` | `var(--bg)` |

Verify none remain:
```bash
grep -n '255, *90, *31\|#ff5a1f\|#0a0a0c\|#6fd0e6' src/app/globals.css
```
Must return nothing.

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

**Done when:** app builds, gate passes, no orange anywhere, no headline wraps mid-word.

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

**Delete `.card::before` and `.card::after` entirely** (globals.css lines 195–214, the
corner ticks). They are the signature motif of the *old* direction and read as noise
against a plate. Removing them is intended, not an oversight.

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

### 2f. The hero hairline

`.hero::after` (line 239) is a horizontal accent gradient across the hero's top edge. Keep
it — it now reads as the light source above the stack. It picks up `--accent` from tokens
automatically; no edit needed. Confirm it still looks intentional against the lip.

**Done when:** gate passes; `/` renders as stacked plates with no rounded corners, no drop
shadows, no corner ticks; nothing scrolls horizontally at 390px.

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
| `#6fd0e6` | 2 | `var(--ref)` |
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
coral bodyweight reference line.

---

## Phase 4 — Remaining routes

Bulk but repetitive. Most of it inherits from Phases 1–3 automatically; this phase is
finding what did not.

Walk each route and fix what looks wrong. In this order:

1. `/prs` — `src/app/prs/page.tsx` (23 lines) + `.pr-*` and dumbbell-chart CSS
   (globals.css 318–369, 566–676). Thin, mostly inherits.
2. `/sessions` — `src/app/sessions/page.tsx` (64 lines) + CSS 370–449 and the calendar
   450–526. Check the `.tag.u` / `.tag.l` region pills read as periwinkle/coral, matching
   the reference build's upper/lower semantics.
3. `/exercise/[id]` — 62 lines + stimulus tabs (CSS 527–549).
4. **`/log` last.** `src/app/log/LogForm.tsx` is 558 lines with its own dense sub-system
   (CSS 733–997: pills, toggles, per-set rows, the skip control). This is the surface used
   mid-workout between working sets — it is the only place a styling regression actually
   costs something. Do it with the test suite already green on everything else.

In the logger CSS, the radius values at lines 762–988 are all `10px`/`12px` pills. Square
them to `2px` for consistency with the plates, **except** `.cal-dot` (line 501) and the two
`border-radius: 50%` circles at 633/655, which are meant to be round.

**Done when:** gate passes; all four routes walked at 390px and 1280px; no orange, no
rounded plates, no horizontal scroll.

---

## Phase 5 — Final verification

```bash
node node_modules/typescript/lib/tsc.js --noEmit 2>&1 | grep -v 'tests/dashboard.spec.ts'
npm test
grep -rn '255, *90, *31\|#ff5a1f\|#6fd0e6\|Anton\|Archivo\|JetBrains' src/
```

The last grep should return nothing. Then confirm the Vercel deploy reached READY.

## Known traps, collected

1. `npx tsc` is broken — use `node node_modules/typescript/lib/tsc.js --noEmit`.
2. `tests/dashboard.spec.ts` errors are pre-existing. Filter them; do not "fix" them.
3. Seven hardcoded orange values in `globals.css` bypass the tokens (Phase 1b).
4. `Space_Mono` needs an explicit `weight`; `Fraunces` must not have one.
5. Anton to Fraunces widens every headline by 30–40% (Phase 1d).
6. `padding` shorthand on a shared element wipes the width container's horizontal padding
   (Phase 2d).
7. Recharts gradient `stopColor` and `LabelList fill` may not accept `var()` (Phase 3).
