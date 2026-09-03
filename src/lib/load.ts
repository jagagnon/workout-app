import type { LoadType } from "./types";

export function formatLoad(
  loadType: LoadType,
  value: number | null | undefined,
  unit = "kg",
  perSide = false,
): string {
  // One representation across the app: a positive number is load carried, a
  // negative one is assistance. `added` vs `external` reads identically — the
  // distinction is display-only and was never applied consistently.
  let base: string;
  if (loadType === "bodyweight" || value == null) base = "BW";
  else base = `${value}${unit}`;
  return perSide && base !== "BW" ? `${base}/side` : base;
}
