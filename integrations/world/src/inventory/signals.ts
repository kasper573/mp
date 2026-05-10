import { ReactiveWorld } from "@rift/reactive";
import { claimedCharacterInventoryId } from "../character/signals";
import { InventoryRef } from "./components";
import type { ItemInstance } from "./views";
import { readItemInstance } from "./views";

export const claimedInventoryItems = ReactiveWorld.memo((s) => {
  const inv = claimedCharacterInventoryId(s).value;
  if (!inv) return [];
  const result: ItemInstance[] = [];
  for (const [id, ref] of s.query(InventoryRef).value) {
    if (ref.inventoryId !== inv) continue;
    const item = readItemInstance(s.world, id);
    if (item) result.push(item);
  }
  return result;
});
