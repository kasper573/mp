import { eq } from "drizzle-orm";
import { DbClient } from "../client";
import { characterTable } from "../schema";

export async function selectOnlineCharacterList(db: DbClient) {
  const drizzle = DbClient.unwrap(db);
  return await drizzle
    .select({ id: characterTable.id, name: characterTable.name })
    .from(characterTable)
    .where(eq(characterTable.online, true));
}
