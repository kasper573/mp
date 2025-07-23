import type { Character, GameState } from "@mp/game/server";
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
              const values = character.snapshot();
              return tx
                .insert(characterTable)
                .values(values as Character)
                .onConflictDoUpdate({
                  target: characterTable.id,
                  set: values,
                });
            }),
        ),
      );
    },
  };
}
