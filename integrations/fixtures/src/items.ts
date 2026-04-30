import type {
  ItemDefinition,
  ItemDefinitionId,
  ItemReference,
} from "@mp/world";
import { consumables } from "./consumables";
import { equipment } from "./equipment";

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
