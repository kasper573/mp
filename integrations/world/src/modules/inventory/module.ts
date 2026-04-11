import type { Entity } from "@rift/core";
import { defineModule } from "@rift/modular";
import { createShortId } from "@mp/std";
import {
  ConsumableStack,
  EquipmentDurability,
  ItemMeta,
} from "../../components";
import type {
  ConsumableDefinitionId,
  ConsumableInstanceId,
  EquipmentDefinitionId,
  EquipmentInstanceId,
  InventoryId,
  ItemInstanceId,
} from "../../domain-ids";

export interface AddConsumableInput {
  inventoryId: InventoryId;
  definitionId: ConsumableDefinitionId;
  maxStackSize: number;
}

export interface AddEquipmentInput {
  inventoryId: InventoryId;
  definitionId: EquipmentDefinitionId;
  maxDurability: number;
}

export type AddConsumableResult =
  | { kind: "stacked"; entity: Entity; stackSize: number }
  | { kind: "created"; entity: Entity }
  | { kind: "full"; entity: Entity };

export interface InventoryApi {
  createInventory(): InventoryId;
  addConsumable(input: AddConsumableInput): AddConsumableResult;
  addEquipment(input: AddEquipmentInput): Entity;
  removeItem(instanceId: ItemInstanceId): boolean;
  listItems(inventoryId: InventoryId): Entity[];
  findItem(instanceId: ItemInstanceId): Entity | undefined;
}

export const InventoryModule = defineModule({
  server: (ctx): { api: InventoryApi } => {
    const createInventory: InventoryApi["createInventory"] = () =>
      createShortId<InventoryId>();

    const listItems: InventoryApi["listItems"] = (inventoryId) => {
      const result: Entity[] = [];
      for (const e of ctx.rift.query(ItemMeta).value) {
        if (e.get(ItemMeta).inventoryId === inventoryId) result.push(e);
      }
      return result;
    };

    const findItem: InventoryApi["findItem"] = (instanceId) => {
      for (const e of ctx.rift.query(ItemMeta).value) {
        if (e.get(ItemMeta).instanceId === instanceId) return e;
      }
      return undefined;
    };

    const findConsumableStack = (
      inventoryId: InventoryId,
      definitionId: ConsumableDefinitionId,
    ): Entity | undefined => {
      for (const e of ctx.rift.query(ItemMeta, ConsumableStack).value) {
        const meta = e.get(ItemMeta);
        if (meta.inventoryId !== inventoryId) continue;
        if (meta.definitionId !== definitionId) continue;
        return e;
      }
      return undefined;
    };

    const addConsumable: InventoryApi["addConsumable"] = (input) => {
      const existing = findConsumableStack(
        input.inventoryId,
        input.definitionId,
      );
      if (existing) {
        const stack = existing.get(ConsumableStack);
        if (stack.stackSize >= input.maxStackSize) {
          return { kind: "full", entity: existing };
        }
        const nextSize = stack.stackSize + 1;
        existing.set(ConsumableStack, { stackSize: nextSize });
        return { kind: "stacked", entity: existing, stackSize: nextSize };
      }
      const entity = ctx.rift.spawn();
      entity.set(ItemMeta, {
        instanceId: createShortId<ConsumableInstanceId>(),
        definitionId: input.definitionId,
        inventoryId: input.inventoryId,
        itemType: "consumable",
      });
      entity.set(ConsumableStack, { stackSize: 1 });
      return { kind: "created", entity };
    };

    const addEquipment: InventoryApi["addEquipment"] = (input) => {
      const entity = ctx.rift.spawn();
      entity.set(ItemMeta, {
        instanceId: createShortId<EquipmentInstanceId>(),
        definitionId: input.definitionId,
        inventoryId: input.inventoryId,
        itemType: "equipment",
      });
      entity.set(EquipmentDurability, { durability: input.maxDurability });
      return entity;
    };

    const removeItem: InventoryApi["removeItem"] = (instanceId) => {
      const entity = findItem(instanceId);
      if (!entity) return false;
      ctx.rift.destroy(entity);
      return true;
    };

    return {
      api: {
        createInventory,
        addConsumable,
        addEquipment,
        removeItem,
        listItems,
        findItem,
      },
    };
  },
  client: (): { api: Record<string, never> } => ({ api: {} }),
});
