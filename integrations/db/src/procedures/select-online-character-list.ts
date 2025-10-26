import { eq } from "drizzle-orm";
import type { DbClient } from "../client";
import { characterTable } from "../schema";

export async function selectOnlineCharacterList(db: DbClient) {
  return await db
    .select({ id: characterTable.id, name: characterTable.name })
    .from(characterTable)
    .where(eq(characterTable.online, true));
}
