import type { DbClient } from "@mp/db";
import { characterTable } from "./character/schema";
import type { GameStateMachine } from "./game-state";

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
