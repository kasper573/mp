import type { EntityId } from "@rift/core";
import type { WorldSignals } from "@rift/reactive";
import {
  ConsumableInstance as RiftConsumable,
  EquipmentInstance as RiftEquipment,
} from "../item/components";
import { InventoryRef, type InventoryId } from "./components";
import type {
  ConsumableInstanceId,
  EquipmentInstanceId,
} from "../item/components";
import type {
  ConsumableDefinitionId,
  EquipmentDefinitionId,
} from "@mp/fixtures";

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

export function itemInstance(
  signal: WorldSignals,
  entityId: EntityId,
): ItemInstance | undefined {
  const inventoryRef = signal.get(entityId, InventoryRef).value;
  if (!inventoryRef) {
    return undefined;
  }
  const c = signal.get(entityId, RiftConsumable).value;
  if (c) {
    return {
      type: "consumable",
      id: c.instanceId,
      definitionId: c.definitionId,
      inventoryId: inventoryRef.inventoryId,
      stackSize: c.stackSize,
    };
  }
  const e = signal.get(entityId, RiftEquipment).value;
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
