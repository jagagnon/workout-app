// src/db/migrate-exercise-region.ts
// One-off backfill for the new exercise.region column ('U' | 'L' | 'core').
// Classified by movement pattern, not just which day it happened to be logged
// under historically (several core/anti-rotation lifts — Kneeling pallof press,
// Landmine rotational press, Single-arm farmer's carry, Weighted Copenhagen
// plank — were already logged on both U and L days, confirming the split).
// Idempotent: safe to re-run.
import { sql } from "./client";

const REGION: Record<string, "U" | "L" | "core"> = {
  "Baby ring muscle-up": "U",
  "Banded hip extension": "L",
  "Banded hip flexion": "L",
  "Banded step-down": "L",
  "Bar dips": "U",
  "Bottom quarter pull-ups": "U",
  "Bulgarian split squat": "L",
  "Chest-to-bar pull-up": "U",
  "Chin-ups": "U",
  "Contralateral single-leg glute bridge + band pull-down": "L",
  "Copenhagen plank dips": "core",
  "Copenhagen side planks": "core",
  "DNS star plank": "core",
  "Dead bugs": "core",
  "Diagonal chop": "core",
  "Dips": "U",
  "False-grip dead hang": "U",
  "False-grip ring row": "U",
  "Front foot elevated split squat": "L",
  "Front lever tuck hold": "U",
  "Front lever tuck row": "U",
  "Goblet cossack squat": "L",
  "Goblet squat": "L",
  "Hanging leg raise": "core",
  "High pull-ups": "U",
  "Hip thrust isometric hold": "L",
  "Hollow body hold": "core",
  "Hollow body swings": "core",
  "Inverted rows": "U",
  "Ipsilateral KB RDL to knee drive": "L",
  "Ipsilateral suitcase split squat": "L",
  "KB marches": "L",
  "Kettlebell Z press": "U",
  "Kickstand RDL": "L",
  "Kneeling KB press": "U",
  "Kneeling pallof press": "core",
  "L-sit hold": "core",
  "Landmine rotational press": "core",
  "Lateral step ups": "L",
  "Long lever rocking planks": "core",
  "Lunge Jumps": "L",
  "Lunge to high knee": "L",
  "Muscle-up": "U",
  "Muscle-up negative": "U",
  "Nordic curls": "L",
  "Parallette push-ups": "U",
  "Paused dips": "U",
  "Pelvic drops": "L",
  "Peterson step down": "L",
  "Pogo Jumps": "L",
  "Poliquin step-down": "L",
  "Pull-ups": "U",
  "Push-ups": "U",
  "Reverse lunge": "L",
  "Ring dip": "U",
  "Ring muscle-up row": "U",
  "Ring support hold": "U",
  "Ring support hold (turned out)": "U",
  "Scapular push-up": "U",
  "Seated machine row": "U",
  "Seated single arm row": "U",
  "Shoulder taps": "core",
  "Side Skates": "L",
  "Side lunge knee drive": "L",
  "Single leg RDL": "L",
  "Single leg deficit heel raise": "L",
  "Single-arm farmer's carry": "core",
  "Single-arm landmine press": "U",
  "Single-arm ring row": "U",
  "Single-hip thrust": "L",
  "Sissy squats": "L",
  "Skater squat with counterbalance": "L",
  "Soleus raises": "L",
  "Split stance contralateral banded hip IR pull": "L",
  "Step throughs": "L",
  "Step-ups": "L",
  "Straight-arm pulldown": "U",
  "Suitcase deadlift": "L",
  "Supine KB hip flexion/extension": "L",
  "Tibialis raises": "L",
  "Top quarter pull drills": "U",
  "Touchdown squats": "L",
  "Two-handed KB deadlift": "L",
  "Weighted Copenhagen plank": "core",
  "Weighted pullover": "U",
};

async function main() {
  const rows = (await sql`select id, canonical_name from exercise`) as unknown as
    Array<{ id: number; canonical_name: string }>;

  let updated = 0;
  const unmatched: string[] = [];
  for (const r of rows) {
    const region = REGION[r.canonical_name];
    if (!region) { unmatched.push(r.canonical_name); continue; }
    await sql`update exercise set region = ${region} where id = ${r.id}`;
    updated++;
  }
  console.log(`region backfilled: ${updated}/${rows.length}`);
  if (unmatched.length) console.log(`no classification found for: ${unmatched.join(", ")}`);
  await sql.end();
}
main();
