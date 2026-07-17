import { NextResponse } from "next/server";
import { recentRuns, weeklyVolume } from "../../../lib/runs";

export async function GET() {
  const [runs, weekly] = await Promise.all([recentRuns(), weeklyVolume()]);
  return NextResponse.json({ runs, weekly });
}
