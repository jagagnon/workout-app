import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { sql } from "../src/db/client";
import { POST as authPost } from "../src/app/api/auth/route";
import { POST as logPost } from "../src/app/api/log/route";
import { AUTH_LIMITS, sessionCookie, sessionToken } from "../src/lib/auth";

// Distinct per-test IPs so the rate-limit ledger of one test can't leak into another.
const IP_OK = "203.0.113.10";
const IP_BAD = "203.0.113.11";
const DATE = "2099-06-01";

function authReq(passcode: string, ip: string) {
  return new Request("http://test/api/auth", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({ passcode }),
  });
}

async function cleanup() {
  await sql`delete from auth_attempt where ip in (${IP_OK}, ${IP_BAD})`;
  await sql`delete from entry where session_id in (select id from session where date = ${DATE})`;
  await sql`delete from session where date = ${DATE}`;
}

before(async () => {
  assert.ok(process.env.APP_PASSCODE, "APP_PASSCODE must be set in .env.local");
  assert.ok(process.env.SESSION_SECRET, "SESSION_SECRET must be set in .env.local");
  await cleanup();
});
after(async () => { await cleanup(); await sql.end(); });

test("correct passcode sets the session cookie", async () => {
  const r = await authPost(authReq(process.env.APP_PASSCODE!, IP_OK));
  assert.equal(r.status, 200);
  assert.match(r.headers.get("set-cookie") ?? "", /wa_session=.+HttpOnly/i);
});

test("wrong passcode is 401, and the fifth failure trips a 429", async () => {
  for (let i = 0; i < AUTH_LIMITS.MAX_FAILURES; i++) {
    const r = await authPost(authReq("000000", IP_BAD));
    assert.equal(r.status, 401, `attempt ${i + 1} should still be 401`);
  }
  const blocked = await authPost(authReq("000000", IP_BAD));
  assert.equal(blocked.status, 429);
  // Even the right passcode is refused while the window is open.
  const stillBlocked = await authPost(authReq(process.env.APP_PASSCODE!, IP_BAD));
  assert.equal(stillBlocked.status, 429);
});

test("a valid session cookie authorises POST /api/log", async () => {
  const r = await logPost(new Request("http://test/api/log", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: sessionCookie(sessionToken()!).split(";")[0] },
    body: JSON.stringify({ date: DATE, region: "U",
      entries: [{ exercise: "Dips", metric: 5, load_type: "bodyweight" }] }),
  }));
  assert.equal(r.status, 200);
});

test("a forged cookie does not", async () => {
  const r = await logPost(new Request("http://test/api/log", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: "wa_session=deadbeef" },
    body: JSON.stringify({ entries: [{ exercise: "Dips", metric: 5, load_type: "bodyweight" }] }),
  }));
  assert.equal(r.status, 401);
});

test("the bearer path still works", async () => {
  const r = await logPost(new Request("http://test/api/log", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.API_BEARER_TOKEN}` },
    body: JSON.stringify({ date: DATE, region: "U",
      entries: [{ exercise: "Dips", metric: 5, load_type: "bodyweight" }] }),
  }));
  assert.equal(r.status, 200);
});
