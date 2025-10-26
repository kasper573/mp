import type {
  ItemDefinition,
  ItemDefinitionLookup,
  ItemDefinitionByReference,
} from "@mp/game-shared";
import { assert } from "@mp/std";

export function createItemDefinitionLookup(
  itemDefinitions: ItemDefinition[],
): ItemDefinitionLookup {
  const maps = new Map<
    ItemDefinition["type"],
    Map<ItemDefinition["id"], ItemDefinition>
  >();
  for (const def of itemDefinitions) {
    let defs = maps.get(def.type);
    if (!defs) {
      defs = new Map([[def.id, def]]);
      maps.set(def.type, defs);
    } else {
      defs.set(def.id, def);
    }
  }
  return (ref) => {
    return assert(
      maps.get(ref.type)?.get(ref.definitionId),
    ) as ItemDefinitionByReference<typeof ref>;
  };
}
