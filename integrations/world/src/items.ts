import { type } from "@mp/validate";

const ConsumableDefinitionType = type({
  type: "'consumable'",
  id: type.string.brand("ConsumableDefinitionId"),
  name: "string",
  maxStackSize: "number",
});
export type ConsumableDefinition = typeof ConsumableDefinitionType.inferOut;

const EquipmentDefinitionType = type({
  type: "'equipment'",
  id: type.string.brand("EquipmentDefinitionId"),
  name: "string",
  maxDurability: "number",
});
export type EquipmentDefinition = typeof EquipmentDefinitionType.inferOut;

export const ItemDefinitionType = ConsumableDefinitionType.or(
  EquipmentDefinitionType,
);

/** @gqlScalar */
export type ItemDefinition = typeof ItemDefinitionType.inferOut;

const ConsumableReferenceType = type({
  type: "'consumable'",
  definitionId: type.string.brand("ConsumableDefinitionId"),
});

const EquipmentReferenceType = type({
  type: "'equipment'",
  definitionId: type.string.brand("EquipmentDefinitionId"),
});

export const ItemReferenceType = ConsumableReferenceType.or(
  EquipmentReferenceType,
);

/** @gqlScalar */
export type ItemReference = typeof ItemReferenceType.inferOut;

export type ItemDefinitionByReference<Ref extends ItemReference> = Extract<
  ItemDefinition,
  { type: Ref["type"] }
>;

export type ItemDefinitionLookup = <Ref extends ItemReference>(
  ref: Ref,
) => ItemDefinitionByReference<Ref>;
