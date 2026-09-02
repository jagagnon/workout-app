import { NextResponse } from "next/server";
import { logPlan, planForDate, type PlanInput, type Region } from "../../../lib/plans";
import { checkBearerOrSession } from "../../../lib/auth";

export async function POST(req: Request) {
  if (!checkBearerOrSession(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: PlanInput;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  if (!body?.region) return NextResponse.json({ error: "no region" }, { status: 400 });
  if (typeof body?.body !== "string") return NextResponse.json({ error: "no body" }, { status: 400 });
  return NextResponse.json(await logPlan(body));
}

// Public read, like /api/progress and /api/prs.
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const date = params.get("date");
  if (!date) return NextResponse.json({ error: "specify ?date=YYYY-MM-DD" }, { status: 400 });
  const region = params.get("region");
  const plan = await planForDate(date, region === "U" || region === "L" ? (region as Region) : undefined);
  return NextResponse.json(plan);
}
