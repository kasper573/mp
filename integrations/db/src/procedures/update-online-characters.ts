import { inArray } from "drizzle-orm";
import { characterTable } from "../schema";
import type { CharacterId } from "@mp/game-shared";
import { procedure } from "../procedure";

export const updateOnlineCharacters = procedure()
  .input<CharacterId[]>()
  .query(async (drizzle, onlineCharacterIds) => {
    await drizzle
      .update(characterTable)
      .set({ online: inArray(characterTable.id, onlineCharacterIds) });
  });
