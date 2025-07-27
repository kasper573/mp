import type { DbClient } from "@mp/db-client";
import { and, characterTable, eq, inArray } from "@mp/db-client";
import type {
  ActorModelLookup,
  AreaResource,
  CharacterId,
  GameState,
  GameStateServer,
} from "@mp/game/server";
import { startAsyncInterval, TimeSpan } from "@mp/time";
import { characterFromDbFields } from "./character-transform";
import type { Rng } from "@mp/std";
import type { Logger } from "@mp/logger";

export function gameStateDbSyncBehavior(
  db: DbClient,
  area: AreaResource,
  state: GameState,
  server: GameStateServer,
  actorModels: ActorModelLookup,
  rng: Rng,
  logger: Logger,
) {
  async function poll() {
    const characterIdsThatShouldBeInService = new Set<CharacterId>(
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

    const characterIdsInState = new Set<CharacterId>(
      state.actors
        .values()
        .flatMap((a) => (a.type === "character" ? [a.identity.id] : [])),
    );
    const expiredCharacterIds = characterIdsInState.difference(
      characterIdsThatShouldBeInService,
    );
    const newCharacterIds =
      characterIdsThatShouldBeInService.difference(characterIdsInState);

    for (const characterId of expiredCharacterIds) {
      state.actors.delete(characterId);
      logger.debug({ characterId }, "Character left game service");
    }

    if (newCharacterIds.size) {
      const newCharacters = await db
        .select()
        .from(characterTable)
        .where(inArray(characterTable.id, newCharacterIds.values().toArray()));

      for (const fields of newCharacters) {
        const char = characterFromDbFields(fields, actorModels, rng);
        state.actors.set(char.identity.id, char);
        server.markToResendFullState(char.identity.id);
        server.addEvent(
          "area.joined",
          { areaId: area.id, characterId: char.identity.id },
          { actors: [char.identity.id] },
        );
        logger.debug(
          { characterId: fields.id },
          "Character joined to game service",
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
          .map((character) => {
            const inputValues: typeof characterTable.$inferInsert = {
              areaId: area.id,
              ...character.identity.snapshot(),
              ...character.appearance.snapshot(),
              ...character.combat.snapshot(),
              ...character.movement.snapshot(),
              ...character.progression.snapshot(),
            };
            return tx
              .insert(characterTable)
              .values(inputValues)
              .onConflictDoUpdate({
                target: characterTable.id,
                set: inputValues,
              });
          }),
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
