import type { PlanInput } from "../lib/plans";

// Last 4 Upper + last 2 Lower sessions from the Notion Workout log (snapshot 2026-06-12),
// so variety/rotation rules have history from session one.
export const SEED_PLANS: PlanInput[] = [
  {
    date: "2026-06-12", region: "U", stimulus: "Strength",
    body: `W: Floor L-sit press, Y-W-T back extension, Banded face pulls with ER, Scapular pull-ups
A1: Ring muscle-up row (explosive) 4×3-5 | A2: Kneeling KB press 4×5-6/side | B1: False-grip ring row 4×3-5 | B2: Weighted dips 4×4-5 | C2: Top quarter pull drills 4×5-6
F: Hollow body hold 3×20-30s`,
  },
  {
    date: "2026-06-10", region: "L", stimulus: null,
    body: `W: 90/90 Hip ER PAIL/RAIL, Adductor rockback with thoracic rotation, KB supine lean-back, Glute bridges
A1: Lunge to high knee 3×6/side | B1: Single leg RDL 4×8R/3×8L | B2: Bench-elevated quadruped knee drive 3×10/side | C1: Heel elevated goblet squat 4×8 | C2: Copenhagen deficit dips 3×8/side | D1: Front foot elevated split squat 4×8R/3×8L | D2: Peterson step-downs 4×10R/3×10L`,
  },
  {
    date: "2026-06-09", region: "U", stimulus: "Strength",
    body: `W: Forearm plank to long plank, Y-W-T back extension, Banded pull-aparts, Scapular push-up
A1: Chest-to-bar pull-up 4-5×3-5 | A2: Paused dips (dip bars) 4-5×3-5 | B1: Weighted chin-ups 4×3-5 | B2: Single-arm landmine press 4×6-8L/3×6-8R`,
  },
  {
    date: "2026-06-07", region: "U", stimulus: "Hypertrophy",
    body: `W: Floor L-sit press, Y-W-T back extension, Banded face pulls with ER, Scapular pull-ups
A1: Chest-to-bar pull-up 3-4×4-6 | A2: Copenhagen side plank 3×30s/side | B1: Pull-ups 3-4×6-8 | B2: Dips 3-4×8-10 | C1: Straight-arm pulldown 3×10-12 | C2: Inverted rows 3×10-12
F: Front lever tuck hold 4×5-8s`,
  },
  {
    date: "2026-06-05", region: "U", stimulus: "Strength",
    body: `W: Forearm plank to long plank, Y-W-T back extension, Banded face pulls with ER, Scapular pull-ups
A1: Ring muscle-up row (explosive) 4×3-5 | A2: Russian dips 4×3-5 | B1: Chin-ups 4×3-5 | B2: Kneeling KB press 4×5-6/side | C1: Seated single-arm row 3×8R/3×8L
F: L-sit hold 3×10-15s`,
  },
  {
    date: "2026-06-01", region: "L", stimulus: null,
    body: `W: 90/90 Hip ER PAIL/RAIL, Hamstring walkouts, Glute bridges, Kettlebell weight shift
A1: Side skates 3×8/side | B1: Touchdown squats 4×8R/3×8L | B2: Supine KB hip flexion/extension with bands 3×12/side | C1: Reverse nordic curls 3×6-8 | C2: Pelvic drops 4×12 | D1: Single leg deficit heel raise 3×12/side | D2: Suitcase deadlifts 4×8/side`,
  },
];

async function main() {
  // Lazy imports so that importing SEED_PLANS (e.g. in tests) doesn't touch the DB.
  const { logPlan } = await import("../lib/plans");
  const { sql } = await import("./client");
  for (const p of SEED_PLANS) await logPlan(p);
  console.log(`Seeded ${SEED_PLANS.length} plans`);
  await sql.end();
}
// Only run when executed directly (so importing SEED_PLANS in tests doesn't hit the DB).
if (process.argv[1] && process.argv[1].endsWith("seed-plans.ts")) main();
