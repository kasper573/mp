import type { GameState } from "@mp/game/server";
import { recordValues } from "@mp/std";
import type { DbClient } from "../client";
import { characterTable } from "../schema";

export function createGameStateService(db: DbClient) {
  return {
    persist: (state: GameState) => {
      return db.transaction((tx) =>
        Promise.all(
          recordValues(state.actors)
            .filter((actor) => actor.type === "character")
            .map((values) => {
              return tx
                .insert(characterTable)
                .values(values)
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
