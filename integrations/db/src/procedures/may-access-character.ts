import type { UserId } from "@mp/oauth";
import { and, eq } from "drizzle-orm";
import type { DbClient } from "../client";
import { characterTable } from "../schema";
import type { CharacterId } from "../types";

export async function mayAccessCharacter(
  db: DbClient,
  userId: UserId,
  characterId: CharacterId,
) {
  const matches = await db.$count(
    db
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
