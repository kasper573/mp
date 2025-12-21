import type {
  ItemDefinition,
  ItemDefinitionLookup,
  ItemDefinitionByReference,
} from "@mp/game-shared";
import { assert, promiseFromResult, withBackoffRetries } from "@mp/std";
import type { DbRepository } from "@mp/db";
import type { Logger } from "@mp/logger";

export function createItemDefinitionLookup(
  db: DbRepository,
  logger: Logger,
): ItemDefinitionLookup {
  const maps = new Map<
    ItemDefinition["type"],
    Map<ItemDefinition["id"], ItemDefinition>
  >();

  logger.info(`Loading item definitions...`);
  void withBackoffRetries("load-item-definitions", async () => {
    const itemDefinitions = await promiseFromResult(
      db.selectAllItemDefinitions(),
    );
    for (const def of itemDefinitions) {
      let defs = maps.get(def.type);
      if (!defs) {
        defs = new Map([[def.id, def]]);
        maps.set(def.type, defs);
      } else {
        defs.set(def.id, def);
      }
    }
    logger.info(
      { definitionCount: itemDefinitions.length },
      `Item definitions loaded successfully`,
    );
  });

  return (ref) => {
    return assert(
      maps.get(ref.type)?.get(ref.definitionId),
    ) as ItemDefinitionByReference<typeof ref>;
  };
}
