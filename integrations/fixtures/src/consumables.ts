import type { ConsumableDefinitionId } from "./ids";

export interface ConsumableDefinition {
  readonly type: "consumable";
  readonly id: ConsumableDefinitionId;
  readonly name: string;
  readonly maxStackSize: number;
}

export const consumables: ReadonlyArray<ConsumableDefinition> = [
  {
    type: "consumable",
    id: "apple" as ConsumableDefinitionId,
    name: "Apple",
    maxStackSize: 10,
  },
];

export const consumablesById: ReadonlyMap<
  ConsumableDefinitionId,
  ConsumableDefinition
> = new Map(consumables.map((c) => [c.id, c]));
