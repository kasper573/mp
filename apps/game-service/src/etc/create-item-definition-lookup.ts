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

  // Start lazy loading in background
  void (async () => {
    let attempt = 0;

    while (maps === null) {
      try {
        attempt++;
        logger.info({ attempt }, `Loading item definitions...`);

        // Use withBackoffRetries with capped delay
        // oxlint-disable-next-line no-await-in-loop
        const itemDefinitions = await withBackoffRetries(
          () => promiseFromResult(db.selectAllItemDefinitions()),
          {
            maxRetries: 10, // Try 10 times before letting outer loop retry
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
        return;
      } catch (error) {
        // Retry with capped delay of 30s
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30000);
        logger.warn(
          { error, attempt, nextRetryIn: delay },
          `Failed to load item definitions after retries, will retry again...`,
        );
        // oxlint-disable-next-line no-await-in-loop
        await new Promise((res) => setTimeout(res, delay));
      }
    }
  })();

  return (ref) => {
    // Progressive enhancement: definitions not available yet will cause lookups to fail gracefully
    // The calling code should handle this by checking if the lookup succeeds
    if (maps === null) {
      // Return a type assertion - caller must handle the case where definitions aren't loaded
      // This will throw when assert is called by consumers if they try to use it before loading
      return null as unknown as ItemDefinitionByReference<typeof ref>;
    }
    return assert(
      maps.get(ref.type)?.get(ref.definitionId),
    ) as ItemDefinitionByReference<typeof ref>;
  };
}

// Legacy function for backwards compatibility if needed
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
