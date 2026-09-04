import { NextResponse } from "next/server";
import { recentPerExercise } from "../../../lib/progress";
import { checkBearerOrSession } from "../../../lib/auth";

export async function GET(req: Request) {
  if (!checkBearerOrSession(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const params = new URL(req.url).searchParams;
  const names = (params.get("exercises") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!names.length) return NextResponse.json({ error: "specify ?exercises=a,b,c" }, { status: 400 });
  const limit = Number(params.get("limit")) || 7;
  return NextResponse.json(await recentPerExercise(names, limit));
}
