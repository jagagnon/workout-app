import { NextResponse } from "next/server";
import { prBoard } from "../../../lib/progress";

export async function GET(req: Request) {
  const all = new URL(req.url).searchParams.get("all") === "1";
  return NextResponse.json(await prBoard(all));
}
