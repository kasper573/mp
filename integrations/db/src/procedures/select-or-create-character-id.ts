import type { UserId } from "@mp/auth";
import type { Tile, TimesPerSecond } from "@mp/std";
import { eq } from "drizzle-orm";
import { characterTable, inventoryTable } from "../schema";
import type { CharacterId } from "@mp/world";
import type { ActorModelId, AreaId } from "@mp/fixtures";
import type { Vector } from "@mp/math";
import { procedure } from "../utils/procedure";

export const selectOrCreateCharacterIdForUser = procedure()
  .input<{
    user: { id: UserId; name: string };
    spawnPoint: {
      areaId: AreaId;
      coords: Vector<Tile>;
    };
    defaultModelId: ActorModelId;
  }>()
  .query(
    async (
      drizzle,
      { user, spawnPoint, defaultModelId },
    ): Promise<CharacterId> => {
      const findResult = await drizzle
        .select({ id: characterTable.id })
        .from(characterTable)
        .where(eq(characterTable.userId, user.id))
        .limit(1);

      if (findResult.length) {
        return findResult[0].id;
      }

      const [inventory] = await drizzle
        .insert(inventoryTable)
        .values({})
        .returning({ id: inventoryTable.id });

      const insertResult = await drizzle
        .insert(characterTable)
        .values({
          areaId: spawnPoint.areaId,
          coords: spawnPoint.coords,
          speed: 3 as Tile,
          health: 100,
          maxHealth: 100,
          attackDamage: 5,
          attackSpeed: 1.25 as TimesPerSecond,
          attackRange: 1 as Tile,
          userId: user.id,
          xp: 0,
          name: user.name,
          modelId: defaultModelId,
          inventoryId: inventory.id,
        })
        .returning({ id: characterTable.id });

      const returned = insertResult.length > 0 ? insertResult[0] : undefined;
      if (!returned) {
        throw new Error("Failed to insert character");
      }

      return returned.id;
    },
  );
