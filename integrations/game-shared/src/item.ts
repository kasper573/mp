import type { InventoryId, ItemId } from "@mp/db/types";
import type { Branded } from "@mp/std";
import { object, prop } from "@mp/sync";

export type ItemInstanceId = Branded<string, "ItemInstanceId">;

export const ItemInstance = object({
  id: prop<ItemInstanceId>(),
  itemId: prop<ItemId>(),
});
export type ItemInstance = typeof ItemInstance.$infer;

export const Inventory = object({
  id: prop<InventoryId>(),
  itemInstanceIds: prop<Set<ItemInstanceId>>(),
});
export type Inventory = typeof Inventory.$infer;
