import type { ConsumableDefinition, ConsumableDefinitionId } from "@mp/world";

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
