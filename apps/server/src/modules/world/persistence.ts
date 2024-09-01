import type { DBClient } from "../../db/client";
import {
  characterTable,
  type Character,
  type DBCharacter,
  type WorldState,
} from "./schema";

export async function persistWorldState(db: DBClient, state: WorldState) {
  try {
    await db.transaction((tx) =>
      Promise.all([
        ...Array.from(state.characters.values()).map((char) => {
          const values = serializeCharacter(char);
          return tx.insert(characterTable).values(values).onConflictDoUpdate({
            target: characterTable.id,
            set: values,
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
    characters: new Map(
      characters.map((char) => [char.id, deserializeCharacter(char)]),
    ),
  };
}

function serializeCharacter(char: Character): DBCharacter {
  return {
    areaId: char.areaId,
    coords: char.coords,
    destination: char.path?.[char.path.length - 1],
    speed: char.speed,
    id: char.id,
  };
}

function deserializeCharacter(char: DBCharacter): Character {
  return {
    areaId: char.areaId,
    coords: char.coords,
    speed: char.speed,
    id: char.id,
  };
}
