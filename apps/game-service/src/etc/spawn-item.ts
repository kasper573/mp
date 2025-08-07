import type { ItemContainerId, ItemId } from "@mp/db/types";
import { ItemInstance, type GameState } from "@mp/game-shared";
import type { Result } from "@mp/std";
import { createShortId, err, ok } from "@mp/std";

export function trySpawnItem(
  gameState: GameState,
  itemId: ItemId,
  targetContainerId: ItemContainerId,
): Result<void, string> {
  const item = ItemInstance.create({
    id: createShortId(),
    itemId,
  });
  gameState.itemInstances.set(item.id, item);
  const container = gameState.itemContainers.get(targetContainerId);
  if (!container) {
    return err(`Item container ${targetContainerId} not found`);
  }
  container.itemInstanceIds.add(item.id);
  return ok(void 0);
}
