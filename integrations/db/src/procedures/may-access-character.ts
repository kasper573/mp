import type { UserId } from "@mp/oauth";
import { and, eq } from "drizzle-orm";
import { DbClient } from "../client";
import { characterTable } from "../schema";
import type { CharacterId } from "@mp/game-shared";

export async function mayAccessCharacter(
  db: DbClient,
  userId: UserId,
  characterId: CharacterId,
) {
  const drizzle = DbClient.unwrap(db);
  const matches = await drizzle.$count(
    drizzle
      .select()
      .from(characterTable)
      .where(
        and(
          eq(characterTable.userId, userId),
          eq(characterTable.id, characterId),
        ),
      ),
  );

  return matches > 0;
}
