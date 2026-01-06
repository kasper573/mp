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

const consumableType = type("'consumable'");
const consumableDefinitionIdType = type.string.brand("ConsumableDefinitionId");
const ConsumableDefinitionType = type({
  type: consumableType,
  id: consumableDefinitionIdType,
  name: "string",
  maxStackSize: "number",
});
export type ConsumableDefinition = typeof ConsumableDefinitionType.inferOut;

const equipmentType = type("'equipment'");
const equipmentDefinitionIdType = type.string.brand("EquipmentDefinitionId");
const EquipmentDefinitionType = type({
  type: equipmentType,
  id: equipmentDefinitionIdType,
  name: "string",
  maxDurability: "number",
});
export type EquipmentDefinition = typeof EquipmentDefinitionType.inferOut;

export const ItemDefinitionType = ConsumableDefinitionType.or(
  EquipmentDefinitionType,
);

// Item instance and definition unions to be able to refer to items as a concept,
// and for properties that are shared, but it's intended that server behavior and
// client rendering should be implementing concrete logic per item type.

/** @gqlScalar */
export type ItemDefinition = typeof ItemDefinitionType.inferOut;

export type ItemInstance = ConsumableInstance | EquipmentInstance;
export type ItemInstanceId = ItemInstance["id"];

export type ItemDefinitionLookup = <Ref extends ItemReference>(
  ref: Ref,
) => ItemDefinitionByReference<Ref>;

const ConsumableReferenceType = type({
  type: "'consumable'",
  definitionId: type.string.brand("ConsumableDefinitionId"),
});
type ConsumableReference = typeof ConsumableReferenceType.inferOut;

const EquipmentReferenceType = type({
  type: "'equipment'",
  definitionId: type.string.brand("EquipmentDefinitionId"),
});
type EquipmentReference = typeof EquipmentReferenceType.inferOut;

export const ItemReferenceType = ConsumableReferenceType.or(
  EquipmentReferenceType,
);

/** @gqlScalar */
export type ItemReference = typeof ItemReferenceType.inferOut;

export type ItemDefinitionByReference<Ref extends ItemReference> = Extract<
  ItemDefinition,
  { type: Ref["type"] }
>;

export const InventoryIdType = type("string").brand("InventoryId");
export type InventoryId = typeof InventoryIdType.infer;

export const EquipmentInstanceIdType = type("string").brand(
  "EquipmentInstanceId",
);
export type EquipmentInstanceId = typeof EquipmentInstanceIdType.infer;

export const EquipmentDefinitionIdType = type("string").brand(
  "EquipmentDefinitionId",
);
export type EquipmentDefinitionId = typeof EquipmentDefinitionIdType.infer;

export const ConsumableInstanceIdType = type("string").brand(
  "ConsumableInstanceId",
);
export type ConsumableInstanceId = typeof ConsumableInstanceIdType.infer;

export const ConsumableDefinitionIdType = type("string").brand(
  "ConsumableDefinitionId",
);
export type ConsumableDefinitionId = typeof ConsumableDefinitionIdType.infer;
