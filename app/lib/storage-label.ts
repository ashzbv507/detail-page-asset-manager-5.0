import type { BrandKey } from "./task-types";

export function storageLocationLabel(brandKey?: BrandKey): "Drive" | "NAS" {
  return brandKey === "serendiment" || brandKey === "sommier" ? "Drive" : "NAS";
}
