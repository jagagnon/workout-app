import { createHash } from "node:crypto";
import { sql } from "../db/client";

// Ingests endurance activities from the COROS Training Hub.
//
// COROS has no practical personal REST API (the official one is a B2B partner
// application; the official COROS MCP is read-only, summary-only, and interactive).
// This uses the reverse-engineered teamapi.coros.com API that the Training Hub web
// app itself calls: login with email + MD5(password) -> accessToken, then paginate
// activity/query. It is unofficial and can break without notice.
//
// Requires COROS_EMAIL and COROS_PASSWORD in env. Run:
//   npm run ingest:coros
// (add --since=YYYYMMDD to limit the backfill window)

const BASE = "https://teamapi.coros.com";

// COROS sportType -> normalized sport. Codes marked (verify) are best-effort:
// after your first ingest run `select distinct sport_type, name from activity`
// and correct any that landed as 'other'. Nothing is lost — raw is preserved and
// the `sport` column is re-derivable.
const SPORT_TYPE: Record<number, string> = {
  100: "run", // outdoor run (verify)
  101: "run", // indoor/treadmill run (verify)
  102: "trail_run", // trail run (verify)
  103: "run", // track run (verify)
  200: "bike", // (verify)
  299: "bike", // indoor bike (verify)
  300: "swim", // pool swim (verify)
  301: "swim", // open water (verify)
};

const RUN_SPORTS = new Set(["run", "trail_run"]);

type CorosActivity = {
  labelId: string;
  sportType: number;
  name?: string;
  startTime?: number; // epoch seconds
  date?: number; // YYYYMMDD
  totalTime?: number; // seconds
  distance?: number; // meters
  calorie?: number;
  avgHeartRate?: number;
  maxHeartRate?: number;
  trainingLoad?: number;
  total?: number; // total ascent, meters (varies)
  ascent?: number;
  [k: string]: unknown;
};

function md5(s: string): string {
  return createHash("md5").update(s).digest("hex");
}

async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${BASE}/account/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account: email, accountType: 2, pwd: md5(password) }),
  });
  const json = (await res.json()) as { result?: string; message?: string; data?: { accessToken?: string } };
  const token = json?.data?.accessToken;
  if (!token) throw new Error(`COROS login failed: ${json?.message ?? res.status}`);
  return token;
}

async function fetchPage(token: string, page: number, size: number, startDay?: string): Promise<CorosActivity[]> {
  const qs = new URLSearchParams({ size: String(size), pageNumber: String(page) });
  if (startDay) qs.set("startDay", startDay);
  const res = await fetch(`${BASE}/activity/query?${qs}`, { headers: { accesstoken: token } });
  const json = (await res.json()) as { data?: { dataList?: CorosActivity[] } };
  return json?.data?.dataList ?? [];
}

function normalize(a: CorosActivity) {
  const sport = SPORT_TYPE[a.sportType] ?? "other";
  const distance_m = a.distance ?? null;
  const duration_s = a.totalTime ?? null;
  const avg_pace_s_km =
    distance_m && duration_s && distance_m > 0 ? Math.round((duration_s / (distance_m / 1000)) * 10) / 10 : null;
  const start_time = a.startTime
    ? new Date(a.startTime * 1000)
    : a.date
      ? new Date(`${String(a.date).slice(0, 4)}-${String(a.date).slice(4, 6)}-${String(a.date).slice(6, 8)}`)
      : new Date();
  return {
    coros_label_id: String(a.labelId),
    sport_type: a.sportType,
    sport,
    start_time,
    name: a.name ?? null,
    distance_m,
    duration_s,
    avg_pace_s_km,
    avg_hr: a.avgHeartRate ?? null,
    max_hr: a.maxHeartRate ?? null,
    calories: a.calorie ?? null,
    training_load: a.trainingLoad ?? null,
    elevation_m: a.ascent ?? a.total ?? null,
    raw: a,
  };
}

async function main() {
  const email = process.env.COROS_EMAIL;
  const password = process.env.COROS_PASSWORD;
  if (!email || !password) throw new Error("Set COROS_EMAIL and COROS_PASSWORD in env (.env.local)");

  const sinceArg = process.argv.find((a) => a.startsWith("--since="))?.split("=")[1];

  const token = await login(email, password);
  console.log("Logged in to COROS Training Hub");

  const size = 50;
  let page = 1;
  let ingested = 0;
  let runs = 0;
  for (;;) {
    const list = await fetchPage(token, page, size, sinceArg);
    if (list.length === 0) break;
    for (const a of list) {
      const r = normalize(a);
      if (RUN_SPORTS.has(r.sport)) runs++;
      await sql`
        insert into activity (
          coros_label_id, sport_type, sport, start_time, name, distance_m,
          duration_s, avg_pace_s_km, avg_hr, max_hr, calories, training_load, elevation_m, raw
        ) values (
          ${r.coros_label_id}, ${r.sport_type}, ${r.sport}, ${r.start_time}, ${r.name}, ${r.distance_m},
          ${r.duration_s}, ${r.avg_pace_s_km}, ${r.avg_hr}, ${r.max_hr}, ${r.calories},
          ${r.training_load}, ${r.elevation_m}, ${sql.json(r.raw as never)}
        )
        on conflict (coros_label_id) do update set
          sport = excluded.sport,
          distance_m = excluded.distance_m,
          duration_s = excluded.duration_s,
          avg_pace_s_km = excluded.avg_pace_s_km,
          avg_hr = excluded.avg_hr,
          max_hr = excluded.max_hr,
          calories = excluded.calories,
          training_load = excluded.training_load,
          elevation_m = excluded.elevation_m,
          raw = excluded.raw
      `;
      ingested++;
    }
    if (list.length < size) break;
    page++;
  }

  console.log(`Ingested ${ingested} activities (${runs} runs) from COROS.`);
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
