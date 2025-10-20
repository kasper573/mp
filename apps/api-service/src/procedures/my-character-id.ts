import { e } from "@mp/db";
import type { CharacterId } from "@mp/db/types";
import type { InjectionContainer } from "@mp/ioc";
import type { UserIdentity } from "@mp/oauth";
import { createShortId } from "@mp/std";
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
  const findResult = await e
    .select(e.Character, (char) => ({
      characterId: true,
      filter: e.op(char.userId, "=", e.uuid(user.id)),
      limit: 1,
    }))
    .run(db);

  if (findResult.length) {
    return findResult[0].characterId as CharacterId;
  }

  const models = await e
    .select(e.ActorModel, () => ({
      modelId: true,
      limit: 1,
    }))
    .run(db);

  if (models.length === 0) {
    throw new Error("No actor models found in the database");
  }

  const inventoryId: string = createShortId();
  await e
    .insert(e.Inventory, {
      inventoryId: inventoryId,
    })
    .run(db);

  const spawnPoint = await getDefaultSpawnPoint(ioc);
  const characterId: string = createShortId();

  await e
    .insert(e.Character, {
      characterId: characterId,
      coords: spawnPoint.coords,
      areaId: e.assert_single(
        e.select(e.Area, (area) => ({
          filter: e.op(area.areaId, "=", spawnPoint.areaId),
        })),
      ),
      speed: 3,
      health: 100,
      maxHealth: 100,
      attackDamage: 5,
      attackSpeed: 1.25,
      attackRange: 1,
      userId: e.uuid(user.id),
      xp: 0,
      name: user.name,
      online: false,
      modelId: e.assert_single(
        e.select(e.ActorModel, (model) => ({
          filter: e.op(model.modelId, "=", models[0].modelId),
        })),
      ),
      inventoryId: e.assert_single(
        e.select(e.Inventory, (inv) => ({
          filter: e.op(inv.inventoryId, "=", inventoryId),
        })),
      ),
    })
    .run(db);

  return characterId as CharacterId;
}
