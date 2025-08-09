import type { DbClient } from "@mp/db";
import { and, characterTable, eq, inArray, itemInstanceTable } from "@mp/db";
import type { CharacterId } from "@mp/db/types";
import type { Character } from "@mp/game-shared";
import {
  ItemInstance,
  type ActorModelLookup,
  type AreaResource,
  type GameState,
} from "@mp/game-shared";
import type { Logger } from "@mp/logger";
import { typedAssign, type Rng } from "@mp/std";
import { startAsyncInterval, TimeSpan } from "@mp/time";
import { characterFromDbFields, dbFieldsFromCharacter } from "./db-transform";
import type { GameStateServer } from "./game-state-server";

export function gameStateDbSyncBehavior(
  db: DbClient,
  area: AreaResource,
  state: GameState,
  server: GameStateServer,
  actorModels: ActorModelLookup,
  rng: Rng,
  logger: Logger,
) {
  /**
   * Polls the database for game state changes and updates the game state accordingly.
   */
  async function poll() {
    const desiredIds = new Set(
      (
        await db
          .select({ id: characterTable.id })
          .from(characterTable)
          .where(
            and(
              eq(characterTable.areaId, area.id),
              eq(characterTable.online, true),
            ),
          )
      ).map((row) => row.id),
    );

    const activeIds = new Set(
      state.actors
        .values()
        .flatMap((a) => (a.type === "character" ? [a.identity.id] : [])),
    );
    const removedIds = activeIds.difference(desiredIds);
    const addedIds = desiredIds.difference(activeIds);

    removedIds.forEach(removeCharacterFromGameState);

    if (addedIds.size) {
      const addedCharacters = await db
        .select()
        .from(characterTable)
        .where(inArray(characterTable.id, addedIds.values().toArray()));

      addedCharacters.forEach(addCharacterToGameState);
    }

    const itemInstanceFields = await db
      .select()
      .from(itemInstanceTable)
      .where(
        inArray(
          itemInstanceTable.inventoryId,
          state.actors
            .values()
            .flatMap((a) => (a.type === "character" ? [a.inventoryId] : []))
            .toArray(),
        ),
      );

    upsertItemInstancesInGameState(itemInstanceFields);
  }

  /**
   * Updates the database with the current game state.
   */
  function save() {
    return db.transaction(async (tx) => {
      await Promise.all(
        state.actors
          .values()
          .filter((actor) => actor.type === "character")
          .map((char) =>
            tx.update(characterTable).set(dbFieldsFromCharacter(char)),
          ),
      );

      await Promise.all(
        state.items.values().map((item) => {
          const values = {
            inventoryId: item.inventoryId,
            itemId: item.itemId,
            id: item.id,
          };
          return tx
            .insert(itemInstanceTable)
            .values(values)
            .onConflictDoUpdate({
              target: [itemInstanceTable.id],
              set: values,
            });
        }),
      );
    });
  }

  function upsertItemInstancesInGameState(
    dbInstances: Array<typeof itemInstanceTable.$inferSelect>,
  ) {
    // Upsert item instances
    for (const itemFields of dbInstances) {
      // Create item instance if it doesn't exist
      const instance = state.items.get(itemFields.id);
      if (!instance) {
        state.items.set(itemFields.id, ItemInstance.create(itemFields));
        logger.debug(
          { itemId: itemFields.id },
          "Added item instance to game state",
        );
      } else {
        typedAssign(instance, itemFields);
      }
    }
  }

  function addCharacterToGameState(
    characterFields: typeof characterTable.$inferSelect,
  ) {
    const char = characterFromDbFields(characterFields, actorModels, rng);
    state.actors.set(char.identity.id, char);
    server.markToResendFullState(char.identity.id);
    logger.debug(
      { characterId: characterFields.id },
      "Character joined game service via db poll",
    );
  }

  function removeCharacterFromGameState(characterId: CharacterId) {
    const char = state.actors.get(characterId) as Character | undefined;
    state.actors.delete(characterId);
    for (const item of state.items.values()) {
      if (item.inventoryId === char?.inventoryId) {
        state.items.delete(item.id);
      }
    }
    logger.debug({ characterId }, "Character left game service via db poll");
  }

  const stopSaving = startAsyncInterval(
    () =>
      save().catch((err) => logger.error(err, "game state db sync save error")),
    saveInterval,
  );

  const stopPolling = startAsyncInterval(
    () =>
      poll().catch((err) => logger.error(err, "game state db sync poll error")),
    pollInterval,
  );

  return function stop() {
    stopSaving();
    stopPolling();
  };
}

const pollInterval = TimeSpan.fromSeconds(3);
const saveInterval = TimeSpan.fromSeconds(5);
