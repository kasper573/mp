import { object, string } from "@rift/types";
import type { Branded } from "@mp/std";

export type InventoryId = Branded<string, "InventoryId">;

export const InventoryRef = object({
  inventoryId: string<InventoryId>(),
});

export const inventoryComponents = [InventoryRef] as const;
