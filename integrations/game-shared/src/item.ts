import type { ItemId } from "@mp/db/types";
import { object, value } from "@mp/sync";

export interface Item {
  id: ItemId;
  name: string;
}

export const ItemContainer = object({
  itemIds: value<Set<ItemId>>(),
});
export type ItemContainer = typeof ItemContainer.$infer;
