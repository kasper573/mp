import type { DBClient } from "../../db/client";
import { characterTable } from "../character/schema";
import type { WorldState } from "./WorldState";

export class WorldService {
  constructor(private db: DBClient) {}

  persist = (state: WorldState) => {
    return this.db.transaction((tx) =>
      Promise.all(
        Object.values(state.characters).map((char) => {
          return tx.insert(characterTable).values(char).onConflictDoUpdate({
            target: characterTable.id,
            set: char,
          });
        }),
      ),
    );
  };
}
