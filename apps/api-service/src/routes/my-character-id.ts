import { characterTable, eq } from "@mp/db";
import type { ActorModelId, CharacterId } from "@mp/game/server";

import type { Tile, TimesPerSecond } from "@mp/std";
import { unsafe } from "@mp/validate";
import { auth } from "../integrations/auth";
import { rpc } from "../integrations/trpc";
import { ctxDbClient } from "../ioc";

import type { UserIdentity } from "@mp/auth";
import type { InjectionContainer } from "@mp/ioc";
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

  const input = {
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
    color: undefined,
    modelId: "adventurer" as ActorModelId,
    opacity: undefined,
  };

  const insertResult = await db
    .insert(characterTable)
    .values(input)
    .returning({ id: characterTable.id });

  const returned = insertResult.length > 0 ? insertResult[0] : undefined;
  if (!returned) {
    throw new Error("Failed to insert character");
  }

  return returned.id;
}
