import { NextResponse } from "next/server";
import {
  AUTH_LIMITS, clientIp, passcodeMatches, sessionCookie, sessionToken,
} from "../../../lib/auth";
import { recentFailures, recordAttempt } from "../../../lib/auth-attempts";

export async function POST(req: Request) {
  const passcode = process.env.APP_PASSCODE;
  const token = sessionToken();
  if (!passcode || !token) {
    return NextResponse.json({ error: "auth not configured" }, { status: 500 });
  }

  let body: { passcode?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }

  const ip = clientIp(req);
  if (await recentFailures(ip) >= AUTH_LIMITS.MAX_FAILURES) {
    return NextResponse.json(
      { error: "too many attempts", retry_after_minutes: AUTH_LIMITS.WINDOW_MIN },
      { status: 429, headers: { "retry-after": String(AUTH_LIMITS.WINDOW_MIN * 60) } },
    );
  }

  const ok = passcodeMatches(body?.passcode);
  await recordAttempt(ip, ok);
  if (!ok) return NextResponse.json({ error: "wrong passcode" }, { status: 401 });

  return NextResponse.json({ ok: true }, { headers: { "set-cookie": sessionCookie(token) } });
}
