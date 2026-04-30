import type {
  ConsumableDefinitionId,
  EquipmentDefinitionId,
} from "../identity/ids";

export interface ConsumableDefinition {
  readonly type: "consumable";
  readonly id: ConsumableDefinitionId;
  readonly name: string;
  readonly maxStackSize: number;
}

export interface EquipmentDefinition {
  readonly type: "equipment";
  readonly id: EquipmentDefinitionId;
  readonly name: string;
  readonly maxDurability: number;
}

export type ItemDefinition = ConsumableDefinition | EquipmentDefinition;
export type ItemDefinitionId = ItemDefinition["id"];

export type ItemReference =
  | {
      readonly type: "consumable";
      readonly definitionId: ConsumableDefinitionId;
    }
  | {
      readonly type: "equipment";
      readonly definitionId: EquipmentDefinitionId;
    };
