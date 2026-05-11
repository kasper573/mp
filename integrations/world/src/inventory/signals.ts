import { ReactiveWorld } from "@rift/reactive";
import { claimedCharacterInventoryId } from "../character/signals";
import { InventoryRef } from "./components";
import type { ItemInstance } from "./views";
import { itemInstance } from "./views";

export const claimedInventoryItems = ReactiveWorld.memo((w) => {
  const inv = claimedCharacterInventoryId(w).value;
  if (!inv) {
    return [];
  }
  const result: ItemInstance[] = [];
  for (const [id, ref] of w.query(InventoryRef)) {
    if (ref.inventoryId !== inv) {
      continue;
    }
    const item = itemInstance(w, id);
    if (item) {
      result.push(item);
    }
  }
  return result;
});
