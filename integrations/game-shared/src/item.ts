import type { InventoryId, ItemId } from "@mp/db/types";
import type { Branded } from "@mp/std";
import { object, prop } from "@mp/sync";

export type ItemInstanceId = Branded<string, "ItemInstanceId">;

export const ItemInstance = object({
  id: prop<ItemInstanceId>(),
  itemId: prop<ItemId>(),
  inventoryId: prop<InventoryId>(),
});
export type ItemInstance = typeof ItemInstance.$infer;
