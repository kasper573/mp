import { recordValues } from "@mp/std";
import type { PatchStateMachine } from "@mp/sync-server";
import type { DBClient } from "../../db/client.ts";
import { characterTable } from "../character/schema.ts";
import type { WorldState } from "./WorldState.ts";

export class WorldService {
  constructor(private db: DBClient) {}

  persist = (state: PatchStateMachine<WorldState>) => {
    return this.db.transaction((tx) =>
      Promise.all(
        recordValues(state.actors())
          .filter((actor) => actor.type === "character")
          .map((char) => {
            return tx.insert(characterTable).values(char).onConflictDoUpdate({
              target: characterTable.id,
              set: char,
            });
          }),
      )
    );
  };
}
