import { actorModelTable, characterTable, eq, inventoryTable } from "@mp/db";
import type { CharacterId } from "@mp/db/types";
import type { InjectionContainer } from "@mp/ioc";
import type { UserIdentity } from "@mp/oauth";
import type { Tile, TimesPerSecond } from "@mp/std";
import { unsafe } from "@mp/validate";
import { ctxDbClient } from "../context";
import { auth } from "../integrations/auth";
import { rpc } from "../integrations/trpc";
import { getDefaultSpawnPoint } from "./default-spawn-point";

export const myCharacterId = rpc.procedure
  .use(auth())
  .output(unsafe<CharacterId>())
  .query(({ ctx }) => getOrCreateCharacterIdForUser(ctx.ioc, ctx.user));

async function getOrCreateCharacterIdForUser(
  ioc: InjectionContainer,
  user: UserIdentity,
): Promise<CharacterId> {
  const db = ioc.get(ctxDbClient);
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
      ...(await getDefaultSpawnPoint(ioc)),
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
