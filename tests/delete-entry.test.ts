import { test, after } from "node:test";
import assert from "node:assert/strict";
import { deleteEntry } from "../src/lib/delete-entry";
import { sql } from "../src/db/client";

const TEST_DATES = ["2099-04-05", "2099-04-06", "2099-04-07", "2099-04-08", "2099-04-09"];

after(async () => {
  await sql`delete from entry where session_id in (select id from session where date = any(${TEST_DATES}))`;
  await sql`delete from session where date = any(${TEST_DATES})`;
  await sql`delete from exercise where canonical_name = 'Test Delete Entry Exercise'`;
  await sql.end();
});

test("deletes one entry without touching the exercise or other entries", async () => {
  const [ex] = await sql`
    insert into exercise (canonical_name, aliases, primary_metric, default_load_type, is_key)
    values ('Test Delete Entry Exercise', '{"tdee alias"}', 'reps', 'bodyweight', false)
    returning id
  `;
  const [sessionU] = await sql`
    insert into session (date, region) values ('2099-04-05', 'U') returning id
  `;
  const [sessionL] = await sql`
    insert into session (date, region) values ('2099-04-05', 'L') returning id
  `;
  await sql`
    insert into entry (session_id, exercise_id, metric_type, metric_value, load_type)
    values (${sessionU.id}, ${ex.id}, 'reps', 6, 'bodyweight')
  `;
  await sql`
    insert into entry (session_id, exercise_id, metric_type, metric_value, load_type)
    values (${sessionL.id}, ${ex.id}, 'reps', 13, 'bodyweight')
  `;

  const result = await deleteEntry("2099-04-05", "Test Delete Entry Exercise", "U");
  assert.equal(result.deleted, true);
  assert.equal(result.exercise_id, ex.id);
  assert.equal(result.metric_value, 6);

  const remainingExercise = await sql`select id from exercise where id = ${ex.id}`;
  assert.equal(remainingExercise.length, 1);
  const remainingEntries = await sql`select session_id, metric_value from entry where exercise_id = ${ex.id}`;
  assert.equal(remainingEntries.length, 1);
  assert.equal(remainingEntries[0].session_id, sessionL.id);
  assert.equal(Number(remainingEntries[0].metric_value), 13);

  await sql`delete from entry where exercise_id = ${ex.id}`;
  await sql`delete from exercise where id = ${ex.id}`;
});

test("matches by alias, case-insensitively", async () => {
  const [ex] = await sql`
    insert into exercise (canonical_name, aliases, primary_metric, default_load_type, is_key)
    values ('Test Delete Entry Exercise', '{"tdee alias"}', 'reps', 'bodyweight', false)
    returning id
  `;
  const [session] = await sql`
    insert into session (date, region) values ('2099-04-06', 'U') returning id
  `;
  await sql`
    insert into entry (session_id, exercise_id, metric_type, metric_value, load_type)
    values (${session.id}, ${ex.id}, 'reps', 4, 'bodyweight')
  `;

  const result = await deleteEntry("2099-04-06", "TDEE ALIAS", "U");
  assert.equal(result.deleted, true);
  assert.equal(result.exercise_id, ex.id);
  assert.equal(result.metric_value, 4);

  await sql`delete from exercise where id = ${ex.id}`;
});

test("errors when multiple sessions exist that day and region is omitted", async () => {
  const [ex] = await sql`
    insert into exercise (canonical_name, aliases, primary_metric, default_load_type, is_key)
    values ('Test Delete Entry Exercise', '{}', 'reps', 'bodyweight', false)
    returning id
  `;
  await sql`insert into session (date, region) values ('2099-04-07', 'U')`;
  await sql`insert into session (date, region) values ('2099-04-07', 'L')`;

  const result = await deleteEntry("2099-04-07", "Test Delete Entry Exercise");
  assert.equal(result.deleted, false);
  assert.match(result.error ?? "", /ambiguous/);

  await sql`delete from exercise where id = ${ex.id}`;
});

test("returns not found for unknown exercise", async () => {
  const result = await deleteEntry("2099-04-08", "Nonexistent Exercise XYZ", "U");
  assert.equal(result.deleted, false);
  assert.equal(result.error, "exercise not found");
});

test("returns error when no logged entry exists for that exercise/date", async () => {
  const [ex] = await sql`
    insert into exercise (canonical_name, aliases, primary_metric, default_load_type, is_key)
    values ('Test Delete Entry Exercise', '{}', 'reps', 'bodyweight', false)
    returning id
  `;
  await sql`insert into session (date, region) values ('2099-04-09', 'U')`;

  const result = await deleteEntry("2099-04-09", "Test Delete Entry Exercise", "U");
  assert.equal(result.deleted, false);
  assert.equal(result.error, "no logged entry for that exercise on that date");

  await sql`delete from exercise where id = ${ex.id}`;
});
