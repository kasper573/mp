import type { InventoryId, ItemId } from "@mp/db/types";
import { ItemInstance, type GameState } from "@mp/game-shared";
import type { Result } from "@mp/std";
import { createShortId, err, ok } from "@mp/std";

export function trySpawnItem(
  gameState: GameState,
  itemId: ItemId,
  inventoryId: InventoryId,
): Result<void, string> {
  const inventory = gameState.inventories.get(inventoryId);
  if (!inventory) {
    return err(`Inventory ${inventoryId} not found`);
  }

  const item = ItemInstance.create({ id: createShortId(), itemId });
  gameState.items.set(item.id, item);
  inventory.itemInstanceIds = new Set([...inventory.itemInstanceIds, item.id]);
  return ok(void 0);
}
