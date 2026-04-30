import type { EquipmentDefinition, EquipmentDefinitionId } from "@mp/world";

export const equipment: ReadonlyArray<EquipmentDefinition> = [
  {
    type: "equipment",
    id: "sword" as EquipmentDefinitionId,
    name: "Sword",
    maxDurability: 100,
  },
];

export const equipmentById: ReadonlyMap<
  EquipmentDefinitionId,
  EquipmentDefinition
> = new Map(equipment.map((e) => [e.id, e]));
