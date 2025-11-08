import { eq } from "drizzle-orm";
import { characterTable } from "../schema";
import { procedure } from "../procedure";

export const selectOnlineCharacterList = procedure().query((drizzle) => {
  return drizzle
    .select({ id: characterTable.id, name: characterTable.name })
    .from(characterTable)
    .where(eq(characterTable.online, true));
});
