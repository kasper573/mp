import { err, ok, type Result } from "@mp/state";
import type { DBClient } from "../../db/client";
import { characterTable, type WorldState } from "./schema";

export async function persistWorldState(
  db: DBClient,
  state: WorldState,
): Promise<Result<void, unknown>> {
  try {
    await db.transaction((tx) =>
      Promise.all([
        ...Array.from(state.characters.values()).map((char) => {
          return tx.insert(characterTable).values(char).onConflictDoUpdate({
            target: characterTable.id,
            set: char,
          });
        }),
      ]),
    );
    return ok(void 0);
  } catch (error) {
    return err(error);
  }
}

export async function loadWorldState(
  db: DBClient,
): Promise<Result<WorldState, unknown>> {
  try {
    const characters = await db.select().from(characterTable);
    return ok({
      characters: new Map(characters.map((char) => [char.id, char])),
    });
  } catch (error) {
    return err(error);
  }
}
