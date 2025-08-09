import type { DbClient } from "@mp/db";
import { and, characterTable, eq, inArray } from "@mp/db";
import type { CharacterId } from "@mp/db/types";
import type { Character } from "@mp/game-shared";
import {
  Inventory,
  type ActorModelLookup,
  type AreaResource,
  type GameState,
} from "@mp/game-shared";
import type { Logger } from "@mp/logger";
import type { Rng } from "@mp/std";
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
  }

  /**
   * Updates the database with the current game state.
   */
  function save() {
    return db.transaction((tx) =>
      Promise.all(
        state.actors
          .values()
          .filter((actor) => actor.type === "character")
          .map((char) =>
            tx.update(characterTable).set(dbFieldsFromCharacter(char)),
          ),
      ),
    );
  }

  function addCharacterToGameState(
    characterFields: typeof characterTable.$inferSelect,
  ) {
    const char = characterFromDbFields(characterFields, actorModels, rng);
    state.actors.set(char.identity.id, char);
    if (!state.inventories.has(char.inventoryId)) {
      logger.debug(
        { characterId: char.identity.id, inventoryId: char.inventoryId },
        "Creating inventory for character",
      );
      state.inventories.set(
        char.inventoryId,
        Inventory.create({
          id: char.inventoryId,
          itemInstanceIds: new Set(),
        }),
      );
    }
    server.markToResendFullState(char.identity.id);
    logger.debug(
      { characterId: characterFields.id },
      "Character joined game service via db poll",
    );
  }

  function removeCharacterFromGameState(characterId: CharacterId) {
    const char = state.actors.get(characterId) as Character | undefined;
    const inv = char && state.inventories.get(char.inventoryId);
    state.actors.delete(characterId);
    if (char) {
      state.inventories.delete(char.inventoryId);
    }
    if (inv) {
      for (const itemId of inv.itemInstanceIds) {
        state.items.delete(itemId);
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
