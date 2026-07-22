import { test, after } from "node:test";
import assert from "node:assert/strict";
import { deleteExercise } from "../src/lib/delete-exercise";
import { sql } from "../src/db/client";

after(async () => {
  await sql`delete from entry where session_id in (select id from session where date='2099-04-01')`;
  await sql`delete from session where date='2099-04-01'`;
  await sql`delete from exercise where canonical_name = 'Test Delete Exercise'`;
  await sql.end();
});

test("deletes an exercise and its entries", async () => {
  const [ex] = await sql`
    insert into exercise (canonical_name, aliases, primary_metric, default_load_type, is_key)
    values ('Test Delete Exercise', '{}', 'reps', 'bodyweight', false)
    returning id
  `;
  const [session] = await sql`
    insert into session (date, region) values ('2099-04-01', 'U') returning id
  `;
  await sql`
    insert into entry (session_id, exercise_id, metric_type, metric_value, load_type)
    values (${session.id}, ${ex.id}, 'reps', 8, 'bodyweight')
  `;

  const result = await deleteExercise("Test Delete Exercise");
  assert.equal(result.deleted, true);
  assert.equal(result.canonical_name, "Test Delete Exercise");
  assert.equal(result.entries_removed, 1);

  const remaining = await sql`select id from exercise where id = ${ex.id}`;
  assert.equal(remaining.length, 0);
});

test("matches by alias, case-insensitively", async () => {
  const [ex] = await sql`
    insert into exercise (canonical_name, aliases, primary_metric, default_load_type, is_key)
    values ('Test Delete Exercise', '{"test alias"}', 'reps', 'bodyweight', false)
    returning id
  `;
  const result = await deleteExercise("TEST ALIAS");
  assert.equal(result.deleted, true);
  assert.equal(result.exercise_id, ex.id);
  assert.equal(result.entries_removed, 0);
});

test("returns not found for unknown exercise", async () => {
  const result = await deleteExercise("Nonexistent Exercise XYZ");
  assert.equal(result.deleted, false);
  assert.equal(result.error, "not found");
});
