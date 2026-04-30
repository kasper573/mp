import type { ItemDefinition, ItemReference } from "./definitions";

export type ItemDefinitionLookup = <Ref extends ItemReference>(
  ref: Ref,
) => Extract<ItemDefinition, { type: Ref["type"] }>;

export function createItemDefinitionLookup(
  consumables: Iterable<ItemDefinition>,
  equipment: Iterable<ItemDefinition>,
): ItemDefinitionLookup {
  const byKey = new Map<string, ItemDefinition>();
  for (const def of consumables) {
    byKey.set(`consumable:${def.id}`, def);
  }
  for (const def of equipment) {
    byKey.set(`equipment:${def.id}`, def);
  }
  return ((ref: ItemReference) => {
    const def = byKey.get(`${ref.type}:${ref.definitionId}`);
    if (!def) {
      throw new Error(`unknown item: ${ref.type} ${String(ref.definitionId)}`);
    }
    return def;
  }) as ItemDefinitionLookup;
}
