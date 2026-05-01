import type { ConsumableDefinition } from "./consumables";
import type { EquipmentDefinition } from "./equipment";
import type { ConsumableDefinitionId, EquipmentDefinitionId } from "./ids";
import { consumables } from "./consumables";
import { equipment } from "./equipment";

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

export const items: ReadonlyArray<ItemDefinition> = [
  ...consumables,
  ...equipment,
];

export const itemsById: ReadonlyMap<ItemDefinitionId, ItemDefinition> = new Map(
  items.map((i) => [i.id, i]),
);

export function lookupItem<Ref extends ItemReference>(
  ref: Ref,
): Extract<ItemDefinition, { type: Ref["type"] }> {
  const def = itemsById.get(ref.definitionId);
  if (!def || def.type !== ref.type) {
    throw new Error(`unknown item: ${ref.type} ${String(ref.definitionId)}`);
  }
  return def as Extract<ItemDefinition, { type: Ref["type"] }>;
}
