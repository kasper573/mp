import { gatewayRoles } from "@mp/keycloak";
import type { ApiContext } from "../context";
import { ctxDb } from "../context";
import { auth, roles } from "../integrations/auth";
import { assert, promiseFromResult } from "@mp/std";
import type { CharacterId } from "@mp/game-shared";
import { defaultSpawnPoint } from "./spawn-point";

/** @gqlQueryField */
export async function characterList(ctx: ApiContext): Promise<Character[]> {
  await roles(ctx, [gatewayRoles.spectate]);
  return promiseFromResult(ctx.ioc.get(ctxDb).selectOnlineCharacterList());
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
export async function updateMyCharacterName(
  newName: string,
  ctx: ApiContext,
): Promise<boolean> {
  const char = assert(await myCharacter(ctx));
  await promiseFromResult(
    ctx.ioc.get(ctxDb).updateCharacterName({
      characterId: char.id,
      newName: newName.trim(),
    }),
  );
  return true;
}

/** @gqlType */
export interface Character {
  /** @gqlField */
  id: CharacterId;
  /** @gqlField */
  name: string;
}
