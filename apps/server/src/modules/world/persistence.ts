import type { DBClient } from "../../db/client";
import { characterTable, type WorldState } from "./schema";

export async function persistWorldState(db: DBClient, state: WorldState) {
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
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}

export async function loadWorldState(db: DBClient): Promise<WorldState> {
  const characters = await db.select().from(characterTable);
  return {
    characters: new Map(characters.map((char) => [char.id, char])),
  };
}
