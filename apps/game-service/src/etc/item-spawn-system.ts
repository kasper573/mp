import type { ItemReference, GameState } from "@mp/game-shared";
import { ConsumableInstance, EquipmentInstance } from "@mp/game-shared";
import { createShortId } from "@mp/std";
import type { InventoryId } from "@mp/db/types";
import type { Logger } from "@mp/logger";

export function spawnItem(
  gameState: GameState,
  ref: ItemReference,
  inventoryId: InventoryId,
  logger: Logger,
  reason: string,
): void {
  switch (ref.type) {
    case "consumable": {
      const existingStack = gameState.items
        .values()
        .find(
          (i): i is ConsumableInstance =>
            i.inventoryId === inventoryId &&
            i.definitionId === ref.definitionId,
        );
      if (existingStack) {
        existingStack.stackSize += 1;
        logger.info(
          `Increased size of stack ${existingStack.id} to ${existingStack.stackSize} (${reason})`,
        );
        // TODO also figure out why stack size count update seems to race
        // TODO assert against max stack size?
      } else {
        const newItem = ConsumableInstance.create({
          ...ref,
          id: createShortId(),
          inventoryId,
          stackSize: 1,
        });
        logger.info("Created new stack", newItem.definitionId, `(${reason})`);
        gameState.items.set(newItem.id, newItem);
      }
      break;
    }

    case "equipment": {
      const newItem = EquipmentInstance.create({
        ...ref,
        id: createShortId(),
        inventoryId,
        // TODO figure out where these values come from
        durability: 100,
      });
      logger.info("Created new equipment", newItem.definitionId, `(${reason})`);
      gameState.items.set(newItem.id, newItem);
    }
  }
}
