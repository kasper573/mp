import type { GameStateMachine } from "@mp/game/server";
import type { DbClient } from "../client";
import { characterTable } from "../schema";

export class GameService {
  constructor(private db: DbClient) {}

  persist = (state: GameStateMachine) => {
    return this.db.transaction((tx) =>
      Promise.all(
        state.actors
          .values()
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
