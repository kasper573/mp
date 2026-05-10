import { object, string, u32 } from "@rift/types";
import type { EntityId } from "@rift/core";
import type { Branded } from "@mp/std";

export type InventoryId = Branded<string, "InventoryId">;

export const InventoryRef = object({
  inventoryId: string<InventoryId>(),
});

export const OwnedBy = object({
  ownerId: u32<EntityId>(),
});

export const inventoryComponents = [InventoryRef, OwnedBy] as const;
