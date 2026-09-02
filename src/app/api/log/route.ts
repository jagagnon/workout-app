import { NextResponse } from "next/server";
import { logWorkout } from "../../../lib/log-workout";
import { checkBearerOrSession } from "../../../lib/auth";
import type { LogInput } from "../../../lib/types";

export async function POST(req: Request) {
  if (!checkBearerOrSession(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: LogInput;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  if (!body?.entries?.length) return NextResponse.json({ error: "no entries" }, { status: 400 });
  const result = await logWorkout(body);
  return NextResponse.json(result);
}
