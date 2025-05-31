import type { Character, GameState } from "@mp/game/server";
import { selectCollectableSubset } from "@mp/sync";
import type { DbClient } from "../client";
import { characterTable } from "../schema";

export class GameService {
  constructor(private db: DbClient) {}

  persist = (state: GameState) => {
    return this.db.transaction((tx) =>
      Promise.all(
        Object.values(state.actors)
          .filter((actor) => actor.type === "character")
          .map((char) => {
            const values = selectCollectableSubset(char);
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
  };
}
