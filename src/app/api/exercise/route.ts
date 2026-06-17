import { NextResponse } from "next/server";
import { addExercise, type AddExerciseInput } from "../../../lib/add-exercise";
import { checkBearer } from "../../../lib/auth";

export async function POST(req: Request) {
  if (!checkBearer(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: AddExerciseInput;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  if (!body?.canonical_name) return NextResponse.json({ error: "no canonical_name" }, { status: 400 });
  const result = await addExercise(body);
  return NextResponse.json(result);
}
