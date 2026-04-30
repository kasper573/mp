import { object, string, u32 } from "@rift/types";
import type { EntityId } from "@rift/core";
import type { InventoryId } from "../identity/ids";

export const InventoryRef = object({
  inventoryId: string<InventoryId>(),
});

export const OwnedBy = object({
  ownerId: u32<EntityId>(),
});

export const inventoryComponents = [InventoryRef, OwnedBy] as const;
export const inventoryEvents = [] as const;
