import type { ItemId } from "@mp/db/types";
import type { Branded } from "@mp/std";
import { object, prop } from "@mp/sync";

export type ItemInstanceId = Branded<string, "ItemInstanceId">;

export const ItemInstance = object({
  id: prop<ItemInstanceId>(),
  itemId: prop<ItemId>(),
});
export type ItemInstance = typeof ItemInstance.$infer;

export const ItemContainer = object({
  itemInstanceIds: prop<Set<ItemInstanceId>>(),
});
export type ItemContainer = typeof ItemContainer.$infer;
