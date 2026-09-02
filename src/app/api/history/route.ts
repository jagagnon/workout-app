import { NextResponse } from "next/server";
import { recentPerExercise } from "../../../lib/progress";

// Public read, like /api/progress and /api/prs.
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const names = (params.get("exercises") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!names.length) return NextResponse.json({ error: "specify ?exercises=a,b,c" }, { status: 400 });
  const limit = Number(params.get("limit")) || 7;
  return NextResponse.json(await recentPerExercise(names, limit));
}
