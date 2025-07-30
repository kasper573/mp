import type { DbClient } from "@mp/db";
import { and, characterTable, eq, inArray } from "@mp/db";
import type {
  ActorModelLookup,
  AreaResource,
  GameState,
} from "@mp/game-shared";
import type { Logger } from "@mp/logger";
import type { Rng } from "@mp/std";
import { startAsyncInterval, TimeSpan } from "@mp/time";
import {
  characterFromDbFields,
  dbFieldsFromCharacter,
} from "../character/character-transform";
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
   * Even though immediate area leave/join is handled via broadgast events,
   * we still need to poll the database for changes in online characters.
   *
   * (Moving between areas would still work without this polling,
   * but disconnect and reconnect would not work without it.)
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

    for (const characterId of removedIds) {
      state.actors.delete(characterId);
      logger.debug({ characterId }, "Character left game service via db poll");
    }

    if (addedIds.size) {
      const addedCharacters = await db
        .select()
        .from(characterTable)
        .where(inArray(characterTable.id, addedIds.values().toArray()));

      for (const characterFields of addedCharacters) {
        const char = characterFromDbFields(characterFields, actorModels, rng);
        state.actors.set(char.identity.id, char);
        server.markToResendFullState(char.identity.id);
        logger.debug(
          { characterId: characterFields.id },
          "Character joined game service via db poll",
        );
      }
    }
  }

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
