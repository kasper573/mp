import type { UserIdentity } from "@mp/oauth";
import type { Tile, TimesPerSecond } from "@mp/std";
import { eq } from "drizzle-orm";
import type { DbClient } from "../client";
import { characterTable, actorModelTable, inventoryTable } from "../schema";
import type { AreaId, CharacterId } from "../types";
import type { Vector } from "@mp/math";

export async function selectOrCreateCharacterIdForUser(
  db: DbClient,
  user: UserIdentity,
  getDefaultSpawnPoint: () => Promise<{ areaId: AreaId; coords: Vector<Tile> }>,
): Promise<CharacterId> {
  const findResult = await db
    .select({ id: characterTable.id })
    .from(characterTable)
    .where(eq(characterTable.userId, user.id))
    .limit(1);

  if (findResult.length) {
    return findResult[0].id;
  }

  const [model] = await db
    .select({ id: actorModelTable.id })
    .from(actorModelTable)
    .limit(1);
  if (!model) {
    throw new Error("No actor models found in the database");
  }

  const [inventory] = await db
    .insert(inventoryTable)
    .values({})
    .returning({ id: inventoryTable.id });

  const insertResult = await db
    .insert(characterTable)
    .values({
      ...(await getDefaultSpawnPoint()),
      speed: 3 as Tile,
      health: 100,
      maxHealth: 100,
      attackDamage: 5,
      attackSpeed: 1.25 as TimesPerSecond,
      attackRange: 1 as Tile,
      userId: user.id,
      xp: 0,
      name: user.name,
      online: false,
      modelId: model.id,
      inventoryId: inventory.id,
    })
    .returning({ id: characterTable.id });

  const returned = insertResult.length > 0 ? insertResult[0] : undefined;
  if (!returned) {
    throw new Error("Failed to insert character");
  }

  return returned.id;
}
