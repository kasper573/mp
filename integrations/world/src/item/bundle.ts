import type { World, EntityId } from "@rift/core";
import { OwnedBy } from "../inventory/components";
import { ConsumableInstance, EquipmentInstance } from "./components";
import type {
  ConsumableInstanceId,
  EquipmentInstanceId,
} from "../identity/ids";
import type { ItemDefinition } from "./definitions";

export type SpawnItemInit =
  | {
      readonly type: "consumable";
      readonly definition: Extract<ItemDefinition, { type: "consumable" }>;
      readonly instanceId: ConsumableInstanceId;
      readonly stackSize: number;
      readonly ownerId?: EntityId;
    }
  | {
      readonly type: "equipment";
      readonly definition: Extract<ItemDefinition, { type: "equipment" }>;
      readonly instanceId: EquipmentInstanceId;
      readonly durability: number;
      readonly ownerId?: EntityId;
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
  if (init.ownerId !== undefined) {
    world.add(id, OwnedBy, { ownerId: init.ownerId });
  }
  return id;
}
