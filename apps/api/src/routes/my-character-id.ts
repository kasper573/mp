import { characterTable, eq } from "@mp/db-client";
import type {
  ActorModelId,
  AppearanceTrait,
  CharacterId,
} from "@mp/game/server";
import { Character } from "@mp/game/server";
import { assert, Rng, type Tile, type TimesPerSecond } from "@mp/std";
import { auth } from "../integrations/auth";
import { rpc } from "../integrations/trpc";
import { unsafe } from "@mp/validate";
import { ctxDbClient } from "../ioc";
import { cardinalDirections } from "@mp/math";
import { getActorModels } from "./actor-models";
import { getDefaultSpawnPoint } from "./default-spawn-point";
import type { InjectionContainer } from "@mp/ioc";
import type { UserIdentity } from "@mp/auth";

export const myCharacterId = rpc.procedure
  .use(auth())
  .output(unsafe<CharacterId>())
  .query(async ({ ctx }) => {
    const char = await getOrCreateCharacterForUser(ctx.ioc, ctx.user);
    return char.identity.id;
  });

export async function getOrCreateCharacterForUser(
  ioc: InjectionContainer,
  user: UserIdentity,
): Promise<Character> {
  const db = ioc.get(ctxDbClient);
  const findResult = await db
    .select()
    .from(characterTable)
    .where(eq(characterTable.userId, user.id))
    .limit(1);

  let databaseFields = findResult.length > 0 ? findResult[0] : undefined;

  if (!databaseFields) {
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

  const models = await getActorModels(ioc);
  const model = assert(
    models.get(databaseFields.modelId),
    `Could not find actor model "${databaseFields.modelId}"`,
  );

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
}

function characterAppearance(): Omit<AppearanceTrait, "name"> {
  return {
    color: undefined,
    modelId: "adventurer" as ActorModelId,
    opacity: undefined,
  };
}
