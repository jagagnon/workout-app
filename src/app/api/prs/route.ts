import { NextResponse } from "next/server";
import { prBoard } from "../../../lib/progress";

export async function GET() {
  return NextResponse.json(await prBoard());
}
