import { createHmac, timingSafeEqual } from "node:crypto";
import { sql } from "../db/client";

const COOKIE_NAME = "wa_session";
const WINDOW_MIN = 15;
const MAX_FAILURES = 5;
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

// Length-safe constant-time compare. timingSafeEqual throws on length mismatch,
// so hash both sides to a fixed width first.
function safeEqual(a: string, b: string): boolean {
  const key = "cmp";
  const ha = createHmac("sha256", key).update(a).digest();
  const hb = createHmac("sha256", key).update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function checkBearer(req: Request): boolean {
  const token = process.env.API_BEARER_TOKEN;
  if (!token) return false;
  const header = req.headers.get("authorization") ?? "";
  return safeEqual(header, `Bearer ${token}`);
}

// The session cookie is a static signed value — single user, so there is nothing
// per-session to carry and no session table to keep.
export function sessionToken(): string | null {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null;
  return createHmac("sha256", secret).update("v1").digest("hex");
}

// Read the cookie off the raw header rather than next/headers `cookies()`:
// tests invoke route handlers directly as POST(new Request(...)), outside any
// Next request context, where cookies() throws.
export function checkSession(req: Request): boolean {
  const expected = sessionToken();
  if (!expected) return false;
  const raw = req.headers.get("cookie") ?? "";
  const hit = raw
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${COOKIE_NAME}=`));
  if (!hit) return false;
  return safeEqual(hit.slice(COOKIE_NAME.length + 1), expected);
}

export function passcodeMatches(input: unknown): boolean {
  const passcode = process.env.APP_PASSCODE;
  if (!passcode || typeof input !== "string") return false;
  return safeEqual(input, passcode);
}

export function checkBearerOrSession(req: Request): boolean {
  return checkBearer(req) || checkSession(req);
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for") ?? "";
  return fwd.split(",")[0].trim() || "unknown";
}

export async function recentFailures(ip: string): Promise<number> {
  const [row] = await sql`
    select count(*)::int as n from auth_attempt
    where ip = ${ip} and ok = false
      and created_at > now() - ${`${WINDOW_MIN} minutes`}::interval
  `;
  return Number(row.n);
}

export async function recordAttempt(ip: string, ok: boolean): Promise<void> {
  await sql`insert into auth_attempt (ip, ok) values (${ip}, ${ok})`;
}

export function sessionCookie(token: string): string {
  return [
    `${COOKIE_NAME}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Secure",
    `Max-Age=${SESSION_MAX_AGE}`,
  ].join("; ");
}

export const AUTH_LIMITS = { WINDOW_MIN, MAX_FAILURES, COOKIE_NAME };
