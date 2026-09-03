import type { LoadType } from "./types";

export function formatLoad(
  loadType: LoadType,
  value: number | null | undefined,
  unit = "kg",
): string {
  // The sign is always explicit: +5kg is load carried, -25kg is assistance.
  // It does not depend on `added` vs `external` — that distinction is not applied
  // consistently in the data and nothing downstream reads it.
  let base: string;
  if (loadType === "bodyweight" || value == null) base = "BW";
  else base = `${value > 0 ? "+" : ""}${value}${unit}`;
  return base;
}
