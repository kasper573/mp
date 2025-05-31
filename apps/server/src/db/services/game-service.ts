import type { GameState } from "@mp/game/server";
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
            return tx.insert(characterTable).values(char).onConflictDoUpdate({
              target: characterTable.id,
              set: char,
            });
          }),
      ),
    );
  };
}
