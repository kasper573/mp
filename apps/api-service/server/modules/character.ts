import { gatewayRoles } from "@mp/keycloak";
import type { ApiContext } from "../context";
import { ctxDb, ctxOnlineCharacterIds } from "../context";
import { auth, roles } from "../integrations/auth";
import { assert, promiseFromResult } from "@mp/std";
import type { CharacterId } from "@mp/game-shared";
import { defaultSpawnPoint } from "./spawn-point";
import type { FormUpdateResult } from "./form";
import { computeSetChanges, toAsyncIterable } from "@mp/state";
import type { MapChanges } from "../../shared/map-changes";

/** @gqlSubscriptionField */
export async function* onlineCharacters(
  ctx: ApiContext,
): AsyncIterable<MapChanges<CharacterId, Character>> {
  await roles(ctx, [gatewayRoles.spectate]);

  const ids = ctx.ioc.get(ctxOnlineCharacterIds);
  const db = ctx.ioc.get(ctxDb);

  for await (const changes of toAsyncIterable(computeSetChanges(ids))) {
    yield { removed: Array.from(changes.removed) };

    const added = await promiseFromResult(
      db.selectCharacterList(Array.from(changes.added)),
    );

    yield { added: added.map((value) => ({ value, key: value.id })) };
  }
}

/** @gqlQueryField */
export async function myCharacterId(ctx: ApiContext): Promise<CharacterId> {
  const { user } = await auth(ctx);
  const spawnPoint = await defaultSpawnPoint(ctx);
  return promiseFromResult(
    ctx.ioc.get(ctxDb).selectOrCreateCharacterIdForUser({
      user: user,
      spawnPoint,
    }),
  );
}

/** @gqlQueryField */
export async function myCharacter(ctx: ApiContext): Promise<Character | null> {
  const { user } = await auth(ctx);
  const result = await promiseFromResult(
    ctx.ioc.get(ctxDb).selectCharacterByUser(user.id),
  );
  return result ?? null;
}

/** @gqlMutationField */
export async function updateMyCharacter(
  input: UpdateMyCharacterInput,
  ctx: ApiContext,
): Promise<FormUpdateResult<UpdateMyCharacterErrors>> {
  const char = assert(await myCharacter(ctx));

  const res = await ctx.ioc.get(ctxDb).updateCharacter({
    characterId: char.id,
    newName: input.newName.trim(),
  });

  if (res.isErr()) {
    if (res.error.type === "nameAlreadyTaken") {
      return {
        errors: {
          newName: [`The name "${res.error.name}" is not available.`],
        },
      };
    }

    throw new Error("Could not update character", { cause: res.error.error });
  }

  return {};
}

/** @gqlInput */
export interface UpdateMyCharacterInput {
  newName: string;
}

/** @gqlType */
export interface UpdateMyCharacterErrors {
  /** @gqlField */
  newName: string[];
}

/** @gqlType */
export interface Character {
  /** @gqlField */
  id: CharacterId;
  /** @gqlField */
  name: string;
}
