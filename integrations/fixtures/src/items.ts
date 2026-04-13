import type {
  ConsumableDefinition,
  ConsumableDefinitionId,
  EquipmentDefinition,
  EquipmentDefinitionId,
} from "./types";

export const consumables: readonly ConsumableDefinition[] = [
  {
    type: "consumable",
    id: "apple" as ConsumableDefinitionId,
    name: "Apple",
    maxStackSize: 10,
  },
];

export const equipment: readonly EquipmentDefinition[] = [
  {
    type: "equipment",
    id: "sword" as EquipmentDefinitionId,
    name: "Sword",
    maxDurability: 100,
  },
];

export const items: readonly (ConsumableDefinition | EquipmentDefinition)[] = [
  ...consumables,
  ...equipment,
];
