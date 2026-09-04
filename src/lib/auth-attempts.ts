import { sql } from "../db/client";
import { AUTH_LIMITS } from "./auth";

// Split out of lib/auth.ts because proxy.ts imports the credential checks, and
// the proxy runs on every request — it must not drag the database client in.
export async function recentFailures(ip: string): Promise<number> {
  const [row] = await sql`
    select count(*)::int as n from auth_attempt
    where ip = ${ip} and ok = false
      and created_at > now() - ${`${AUTH_LIMITS.WINDOW_MIN} minutes`}::interval
  `;
  return Number(row.n);
}

export async function recordAttempt(ip: string, ok: boolean): Promise<void> {
  await sql`insert into auth_attempt (ip, ok) values (${ip}, ${ok})`;
}
