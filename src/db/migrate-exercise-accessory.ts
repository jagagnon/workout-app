// src/db/migrate-exercise-accessory.ts
// One-off backfill for exercise.accessory: true for plyometric filler
// movements Julien doesn't want cluttering the /log picker (accessory, not
// something to deliberately pick and track from that dropdown). Idempotent.
import { sql } from "./client";

const ACCESSORY = ["Pogo Jumps", "Lunge Jumps", "Side Skates"];

async function main() {
  const result = await sql`
    update exercise set accessory = true
    where canonical_name = any(${ACCESSORY})
    returning canonical_name
  `;
  console.log(`marked accessory: ${result.length}/${ACCESSORY.length}`);
  const missing = ACCESSORY.filter((n) => !result.some((r) => r.canonical_name === n));
  if (missing.length) console.log(`not found: ${missing.join(", ")}`);
  await sql.end();
}
main();
