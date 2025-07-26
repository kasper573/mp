import { characterTable, eq } from "@mp/db-client";
import type { ActorModelId, AppearanceTrait } from "@mp/game/server";
import { Character } from "@mp/game/server";
import { assert, Rng, type Tile, type TimesPerSecond } from "@mp/std";
import { auth } from "../integrations/auth";
import { rpc } from "../integrations/trpc";
import { unsafe } from "@mp/validate";
import { ctxDbClient } from "../context";
import { cardinalDirections } from "@mp/math";

import { getActorModels } from "./actor-models";
import { getDefaultSpawnPoint } from "./default-spawn-point";

export const getOrCreateMyCharacter = rpc.procedure
  .use(auth())
  .output(unsafe<Character>())
  .query(async ({ ctx }) => {
    const db = ctx.ioc.get(ctxDbClient);
    const findResult = await db
      .select()
      .from(characterTable)
      .where(eq(characterTable.userId, ctx.user.id))
      .limit(1);

    let databaseFields = findResult.length > 0 ? findResult[0] : undefined;

    if (!databaseFields) {
      const input = {
        ...(await getDefaultSpawnPoint(ctx.ioc)),
        speed: 3 as Tile,
        health: 100,
        maxHealth: 100,
        attackDamage: 5,
        attackSpeed: 1.25 as TimesPerSecond,
        attackRange: 1 as Tile,
        userId: ctx.user.id,
        xp: 0,
        name: ctx.user.name,
        ...characterAppearance(),
      };

      const insertResult = await db
        .insert(characterTable)
        .values(input)
        .returning({ id: characterTable.id });

      const returned = insertResult.length > 0 ? insertResult[0] : undefined;
      if (!returned) {
        throw new Error("Failed to insert character");
      }

      databaseFields = { ...input, id: returned.id };
    }

    const models = await getActorModels(ctx.ioc);
    const model = assert(models.get(databaseFields.modelId));

    const rng = new Rng();

    return new Character({
      appearance: {
        modelId: databaseFields.modelId,
        name: databaseFields.name,
        color: undefined,
        opacity: undefined,
      },
      identity: {
        id: databaseFields.id,
        userId: databaseFields.userId,
      },
      progression: {
        xp: databaseFields.xp,
      },
      combat: {
        attackDamage: databaseFields.attackDamage,
        attackRange: databaseFields.attackRange,
        attackSpeed: databaseFields.attackSpeed,
        health: databaseFields.health,
        maxHealth: databaseFields.maxHealth,
        hitBox: model.hitBox,
        attackTargetId: undefined,
        lastAttack: undefined,
      },
      movement: {
        coords: databaseFields.coords,
        speed: databaseFields.speed,
        dir: rng.oneOf(cardinalDirections),
        desiredPortalId: undefined,
        moveTarget: undefined,
        path: undefined,
      },
    });
  });

function characterAppearance(): Omit<AppearanceTrait, "name"> {
  return {
    color: undefined,
    modelId: "adventurer" as ActorModelId,
    opacity: undefined,
  };
}
