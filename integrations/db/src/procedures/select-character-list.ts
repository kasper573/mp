import { inArray } from "drizzle-orm";
import { characterTable } from "../schema";
import { procedure } from "../utils/procedure";
import type { CharacterId } from "@mp/game-shared";

export const selectCharacterList = procedure()
  .input<readonly CharacterId[]>()
  .query((drizzle, ids) => {
    return drizzle
      .select({ id: characterTable.id, name: characterTable.name })
      .from(characterTable)
      .where(inArray(characterTable.id, ids));
  });
