import type { ItemId } from "@mp/db/types";
import type { Branded } from "@mp/std";
import { object, value } from "@mp/sync";

export type ItemInstanceId = Branded<string, "ItemInstanceId">;

export const ItemInstance = object({
  id: value<ItemInstanceId>(),
  itemId: value<ItemId>(),
});
export type ItemInstance = typeof ItemInstance.$infer;

export const ItemContainer = object({
  itemInstanceIds: value<Set<ItemInstanceId>>(),
});
export type ItemContainer = typeof ItemContainer.$infer;
