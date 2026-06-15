import { sql } from "./client";

// canonical_name, aliases, primary_metric, default_load_type
const EXERCISES: [string, string[], "reps" | "seconds" | "meters", string][] = [
  ["Muscle-up", ["muscle up", "mu", "bar muscle-up", "ring muscle-up"], "reps", "assisted"],
  ["Pull-ups", ["pull up", "pullup", "pull-up"], "reps", "bodyweight"],
  ["Chin-ups", ["chin up", "chins", "weighted chin-ups", "chinup"], "reps", "bodyweight"],
  ["Dips", ["dip", "weighted dips", "ring dips", "russian dips"], "reps", "bodyweight"],
  ["Push-ups", ["push up", "pushup", "press-up"], "reps", "bodyweight"],
  ["Inverted rows", ["inverted row", "bodyweight row"], "reps", "bodyweight"],
  ["Straight-arm pulldown", ["straight arm pulldown"], "reps", "external"],
  ["Kneeling KB press", ["kneeling kettlebell press", "kb press"], "reps", "external"],
  ["Kettlebell Z press", ["kb z press", "z press", "kettlebell z press", "k bell z press"], "reps", "external"],
  ["Single-arm landmine press", ["landmine press"], "reps", "external"],
  ["L-sit hold", ["l sit", "l-sit"], "seconds", "bodyweight"],
  ["Front lever tuck hold", ["front lever tuck", "tuck front lever"], "seconds", "bodyweight"],
  ["Hollow body hold", ["hollow hold", "hollow body"], "seconds", "bodyweight"],
  ["Single-arm farmer's carry", ["farmers carry", "farmer carry"], "meters", "external"],
  ["Bulgarian split squat", ["bss", "split squat"], "reps", "external"],
  ["Single leg RDL", ["sl rdl", "single-leg rdl"], "reps", "external"],
  ["Goblet cossack squat", ["cossack squat", "goblet cossack"], "reps", "external"],
];

const KEY = new Set(["Muscle-up", "Pull-ups", "Chin-ups", "Dips", "Push-ups"]);

async function main() {
  for (const [name, aliases, metric, loadType] of EXERCISES) {
    await sql`
      insert into exercise (canonical_name, aliases, primary_metric, default_load_type, is_key)
      values (${name}, ${aliases}, ${metric}, ${loadType}, ${KEY.has(name)})
      on conflict (canonical_name) do update
        set aliases = excluded.aliases,
            primary_metric = excluded.primary_metric,
            default_load_type = excluded.default_load_type,
            is_key = excluded.is_key
    `;
  }
  console.log(`Seeded ${EXERCISES.length} exercises`);
  await sql.end();
}
main();
