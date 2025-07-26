import type { DbClient } from "@mp/db-client";
import { characterTable } from "@mp/db-client";
import type {
  AreaResource,
  Character,
  GameState,
  GameStateServer,
} from "@mp/game/server";
import { TimeSpan } from "@mp/time";

export function gameStateDbSyncBehavior(
  db: DbClient,
  area: AreaResource,
  state: GameState,
  server: GameStateServer,
) {
  function poll() {
    // TODO check if new characters are online in the database matching this game service instance's area
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

  function onCharacterLeftGameService(char: Character) {
    state.actors.delete(char.identity.id);
    server.markToResendFullState(char.identity.id);
    server.addEvent(
      "area.joined",
      { areaId: area.id, characterId: char.identity.id },
      { actors: [char.identity.id] },
    );
  }

  function onCharacterJoinedGameService(char: Character) {
    state.actors.set(char.identity.id, char);
    server.markToResendFullState(char.identity.id);
    server.addEvent(
      "area.joined",
      { areaId: area.id, characterId: char.identity.id },
      { actors: [char.identity.id] },
    );
  }

  const saveIntervalId = setInterval(save, saveInterval.totalMilliseconds);
  const pollIntervalId = setInterval(poll, pollInterval.totalMilliseconds);

  return function stop() {
    clearInterval(saveIntervalId);
    clearInterval(pollIntervalId);
  };
}

const pollInterval = TimeSpan.fromSeconds(1);
const saveInterval = TimeSpan.fromSeconds(5);
