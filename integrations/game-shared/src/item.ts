import type { ItemId } from "@mp/db/types";
import { object, value } from "@mp/sync";

export const ItemInstance = object({
  id: value<ItemId>(),
  name: value<string>(),
});
export type ItemInstance = typeof ItemInstance.$infer;

export const ItemContainer = object({
  itemIds: value<Set<ItemId>>(),
});
export type ItemContainer = typeof ItemContainer.$infer;
