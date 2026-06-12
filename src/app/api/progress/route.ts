import { NextResponse } from "next/server";
import { exerciseProgression, muscleUpLadder, stalledLifts } from "../../../lib/progress";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const exercise = url.searchParams.get("exercise");
  if (exercise) return NextResponse.json(await exerciseProgression(exercise));
  if (url.searchParams.get("ladder") === "1") return NextResponse.json(await muscleUpLadder());
  if (url.searchParams.get("stalled") === "1") return NextResponse.json(await stalledLifts());
  return NextResponse.json({ error: "specify ?exercise= | ?ladder=1 | ?stalled=1" }, { status: 400 });
}
