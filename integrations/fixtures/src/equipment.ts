import type { EquipmentDefinitionId } from "./ids";

export interface EquipmentDefinition {
  readonly type: "equipment";
  readonly id: EquipmentDefinitionId;
  readonly name: string;
  readonly maxDurability: number;
}

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
