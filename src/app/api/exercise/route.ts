import { NextResponse } from "next/server";
import { addExercise, type AddExerciseInput } from "../../../lib/add-exercise";
import { deleteExercise } from "../../../lib/delete-exercise";
import { checkBearerOrSession } from "../../../lib/auth";

export async function POST(req: Request) {
  if (!checkBearerOrSession(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: AddExerciseInput;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  if (!body?.canonical_name) return NextResponse.json({ error: "no canonical_name" }, { status: 400 });
  const result = await addExercise(body);
  return NextResponse.json(result);
}

export async function DELETE(req: Request) {
  if (!checkBearerOrSession(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { canonical_name?: string; exercise_id?: number };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const key = body?.exercise_id ?? body?.canonical_name;
  if (!key) return NextResponse.json({ error: "no canonical_name or exercise_id" }, { status: 400 });
  const result = await deleteExercise(key);
  return NextResponse.json(result);
}
