import type { LoadType } from "./types";

export function formatLoad(
  loadType: LoadType,
  value: number | null | undefined,
  unit = "kg",
  perSide = false,
): string {
  let base: string;
  if (loadType === "bodyweight" || value == null) base = "BW";
  else if (loadType === "added") base = `+${value}${unit}`;
  else if (loadType === "assisted") base = `${value}${unit}`;
  else base = `${value}${unit}`;
  return perSide && base !== "BW" ? `${base}/side` : base;
}
