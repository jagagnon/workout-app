import { NextResponse } from "next/server";
import { prBoard } from "../../../lib/progress";
import { checkBearerOrSession } from "../../../lib/auth";

export async function GET(req: Request) {
  if (!checkBearerOrSession(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const all = new URL(req.url).searchParams.get("all") === "1";
  return NextResponse.json(await prBoard(all));
}
