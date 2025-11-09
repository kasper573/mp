import type {
  ItemDefinition,
  ItemDefinitionLookup,
  ItemDefinitionByReference,
} from "@mp/game-shared";
import { assert, promiseFromResult, withBackoffRetries } from "@mp/std";
import type { DbRepository } from "@mp/db";
import type { Logger } from "@mp/logger";

export function createLazyItemDefinitionLookup(
  db: DbRepository,
  logger: Logger,
): ItemDefinitionLookup {
  let maps: Map<
    ItemDefinition["type"],
    Map<ItemDefinition["id"], ItemDefinition>
  > | null = null;

  void (async () => {
    logger.info(`Loading item definitions...`);

    const itemDefinitions = await withBackoffRetries(
      () => promiseFromResult(db.selectAllItemDefinitions()),
      {
        maxRetries: "infinite",
        initialDelay: 1000,
        factor: 2,
      },
    );

    const newMaps = new Map<
      ItemDefinition["type"],
      Map<ItemDefinition["id"], ItemDefinition>
    >();
    for (const def of itemDefinitions) {
      let defs = newMaps.get(def.type);
      if (!defs) {
        defs = new Map([[def.id, def]]);
        newMaps.set(def.type, defs);
      } else {
        defs.set(def.id, def);
      }
    }
    maps = newMaps;
    logger.info(
      { definitionCount: itemDefinitions.length },
      `Item definitions loaded successfully`,
    );
  })();

  return (ref) => {
    if (maps === null) {
      return null as unknown as ItemDefinitionByReference<typeof ref>;
    }
    return assert(
      maps.get(ref.type)?.get(ref.definitionId),
    ) as ItemDefinitionByReference<typeof ref>;
  };
}

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
