import type { Character, GameState } from "@mp/game/server";
import { selectCollectableSubset } from "@mp/sync";
import type { DbClient } from "../client";
import { characterTable } from "../schema";

export function createGameStateService(db: DbClient) {
  return {
    persist: (state: GameState) => {
      return db.transaction((tx) =>
        Promise.all(
          state.actors
            .values()
            .filter((actor) => actor.type === "character")
            .map((character) => {
              const values = selectCollectableSubset(character);
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
