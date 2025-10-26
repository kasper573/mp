import type { ItemReference } from "@mp/game-shared";
import { ConsumableInstance, EquipmentInstance } from "@mp/game-shared";
import { createShortId } from "@mp/std";
import type { InventoryId } from "@mp/db/types";
import type { Logger } from "@mp/logger";
import type { InjectionContainer } from "@mp/ioc";
import { ctxGameState, ctxItemDefinitionLookup } from "../context";

export function spawnItem(
  ioc: InjectionContainer,
  ref: ItemReference,
  inventoryId: InventoryId,
  logger: Logger,
): void {
  const gameState = ioc.get(ctxGameState);
  const itemDefinition = ioc.get(ctxItemDefinitionLookup);

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
        const def = itemDefinition(ref);
        if (existingStack.stackSize < def.maxStackSize) {
          existingStack.stackSize += 1;
          logger.info(
            `Increased size of stack ${existingStack.id} to ${existingStack.stackSize}`,
          );
        } else {
          logger.info(
            `Stack ${existingStack.id} is full at ${existingStack.stackSize}/${def.maxStackSize}, cannot add more`,
          );
        }
      } else {
        const newItem = ConsumableInstance.create({
          ...ref,
          id: createShortId(),
          inventoryId,
          stackSize: 1,
        });
        logger.info("Created new stack", newItem.definitionId);
        gameState.items.set(newItem.id, newItem);
      }
      break;
    }

    case "equipment": {
      const def = itemDefinition(ref);
      const newItem = EquipmentInstance.create({
        ...ref,
        id: createShortId(),
        inventoryId,
        durability: def.maxDurability,
      });
      logger.info("Created new equipment", newItem.definitionId);
      gameState.items.set(newItem.id, newItem);
    }
  }
}
