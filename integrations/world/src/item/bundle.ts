import type { World, EntityId } from "@rift/core";
import { InventoryRef, type InventoryId } from "../inventory/components";
import {
  ConsumableInstance,
  EquipmentInstance,
  type ConsumableInstanceId,
  type EquipmentInstanceId,
} from "./components";
import type { ItemDefinition } from "./definitions";

export type SpawnItemInit =
  | {
      readonly type: "consumable";
      readonly definition: Extract<ItemDefinition, { type: "consumable" }>;
      readonly instanceId: ConsumableInstanceId;
      readonly stackSize: number;
      readonly inventoryId: InventoryId;
    }
  | {
      readonly type: "equipment";
      readonly definition: Extract<ItemDefinition, { type: "equipment" }>;
      readonly instanceId: EquipmentInstanceId;
      readonly durability: number;
      readonly inventoryId: InventoryId;
    };

export function spawnItem(world: World, init: SpawnItemInit): EntityId {
  const id = world.create();
  if (init.type === "consumable") {
    world.add(id, ConsumableInstance, {
      instanceId: init.instanceId,
      definitionId: init.definition.id,
      stackSize: init.stackSize,
    });
  } else {
    world.add(id, EquipmentInstance, {
      instanceId: init.instanceId,
      definitionId: init.definition.id,
      durability: init.durability,
    });
  }
  world.add(id, InventoryRef, { inventoryId: init.inventoryId });
  return id;
}
