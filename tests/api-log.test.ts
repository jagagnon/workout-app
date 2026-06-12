import { test, after } from "node:test";
import assert from "node:assert/strict";
import { POST } from "../src/app/api/log/route";
import { sql } from "../src/db/client";

after(async () => {
  await sql`delete from entry where session_id in (select id from session where date='2099-03-01')`;
  await sql`delete from session where date='2099-03-01'`;
  await sql.end();
});

test("rejects missing auth", async () => {
  const r = await POST(new Request("http://test/api/log", { method: "POST", body: "{}" }));
  assert.equal(r.status, 401);
});

test("logs a session with valid auth", async () => {
  const token = process.env.API_BEARER_TOKEN;
  assert.ok(token, "API_BEARER_TOKEN must be loaded via --env-file");
  const r = await POST(new Request("http://test/api/log", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ date: "2099-03-01", region: "U",
      entries: [{ exercise: "Dips", metric: 8, load_type: "added", load_value: 10 }] }),
  }));
  assert.equal(r.status, 200);
  const json = await r.json();
  assert.equal(json.results[0].canonical_name, "Dips");
});
