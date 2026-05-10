import type { EntityId } from "@rift/core";
import type { ReactiveWorld } from "@rift/reactive";
import {
  ConsumableInstance as RiftConsumable,
  EquipmentInstance as RiftEquipment,
} from "../item/components";
import { InventoryRef } from "../inventory/components";
import type {
  ConsumableDefinitionId,
  ConsumableInstanceId,
  EquipmentDefinitionId,
  EquipmentInstanceId,
  InventoryId,
} from "../identity/ids";

export interface ConsumableInstanceView {
  readonly type: "consumable";
  readonly id: ConsumableInstanceId;
  readonly definitionId: ConsumableDefinitionId;
  readonly inventoryId: InventoryId;
  readonly stackSize: number;
}

export interface EquipmentInstanceView {
  readonly type: "equipment";
  readonly id: EquipmentInstanceId;
  readonly definitionId: EquipmentDefinitionId;
  readonly inventoryId: InventoryId;
  readonly durability: number;
}

export type ItemInstance = ConsumableInstanceView | EquipmentInstanceView;
export type ItemInstanceId = ConsumableInstanceId | EquipmentInstanceId;

export function readItemInstance(
  world: ReactiveWorld,
  entityId: EntityId,
): ItemInstance | undefined {
  world.trackPool(InventoryRef);
  const inventoryRef = world.get(entityId, InventoryRef);
  if (!inventoryRef) {
    return undefined;
  }
  world.trackPool(RiftConsumable);
  const c = world.get(entityId, RiftConsumable);
  if (c) {
    return {
      type: "consumable",
      id: c.instanceId,
      definitionId: c.definitionId,
      inventoryId: inventoryRef.inventoryId,
      stackSize: c.stackSize,
    };
  }
  world.trackPool(RiftEquipment);
  const e = world.get(entityId, RiftEquipment);
  if (e) {
    return {
      type: "equipment",
      id: e.instanceId,
      definitionId: e.definitionId,
      inventoryId: inventoryRef.inventoryId,
      durability: e.durability,
    };
  }
  return undefined;
}
