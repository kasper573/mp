import type {
  ConsumableInstanceId,
  EquipmentInstanceId,
  InventoryId,
} from "@mp/db/types";
import { object, prop } from "@mp/sync";
import { type } from "@mp/validate";

// Item instances are often created and destroyed at runtime and serialized over the network

function sharedInstanceProps<Ref extends ItemReference>() {
  return {
    type: prop<Ref["type"]>(),
    definitionId: prop<Ref["definitionId"]>(),
    inventoryId: prop<InventoryId>(),
  };
}

export const ConsumableInstance = object({
  id: prop<ConsumableInstanceId>(),
  ...sharedInstanceProps<ConsumableReference>(),
  stackSize: prop<number>(),
});
export type ConsumableInstance = typeof ConsumableInstance.$infer;

export const EquipmentInstance = object({
  id: prop<EquipmentInstanceId>(),
  ...sharedInstanceProps<EquipmentReference>(),
  durability: prop<number>(),
});
export type EquipmentInstance = typeof EquipmentInstance.$infer;

// Item definitions are essentially static and stored in memory on server start,
// but could in edge cases be reloaded at runtime via admin commands,
// but as a mental model it's useful to think of them as static and something
// that clients and servers look up on demand and cache aggressively.

export interface ItemDefinitionBase<Ref extends ItemReference> {
  type: Ref["type"];
  id: Ref["definitionId"];
  name: string;
}

export interface ConsumableDefinition
  extends ItemDefinitionBase<ConsumableReference> {
  maxStackSize: number;
}

export interface EquipmentDefinition
  extends ItemDefinitionBase<EquipmentReference> {
  maxDurability: number;
}

// Item instance and definition unions to be able to refer to items as a concept,
// and for properties that are shared, but it's intended that server behavior and
// client rendering should be implementing concrete logic per item type.

export type ItemDefinition = ConsumableDefinition | EquipmentDefinition;
export type ItemInstance = ConsumableInstance | EquipmentInstance;
export type ItemInstanceId = ItemInstance["id"];

// We define the refs as runtime types because they are often serialized
const ConsumableReference = type({
  type: "'consumable'",
  definitionId: type.string.brand("ConsumableDefinitionId"),
});
type ConsumableReference = typeof ConsumableReference.inferOut;

const EquipmentReference = type({
  type: "'equipment'",
  definitionId: type.string.brand("EquipmentDefinitionId"),
});
type EquipmentReference = typeof EquipmentReference.inferOut;

export const ItemReference = ConsumableReference.or(EquipmentReference);
export type ItemReference = typeof ItemReference.inferOut;

export type ItemDefinitionByReference<Ref extends ItemReference> = Extract<
  ItemDefinition,
  ItemDefinitionBase<Ref>
>;
