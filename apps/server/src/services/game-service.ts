import type { GameState } from "@mp/game/server";
import type { DbClient } from "@mp/db";
import { characterTable } from "@mp/db";

export function createGameStateService(db: DbClient) {
  return {
    persist: (state: GameState) => {
      return db.transaction((tx) =>
        Promise.all(
          state.actors
            .values()
            .filter((actor) => actor.type === "character")
            .map((character) => {
              const inputValues: typeof characterTable.$inferInsert = {
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
    },
  };
}
