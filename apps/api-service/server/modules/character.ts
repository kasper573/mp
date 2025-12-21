import { gatewayRoles } from "@mp/keycloak";
import { ApiContext, ctxDb } from "../context";
import { auth, roles } from "../integrations/auth";
import { promiseFromResult } from "@mp/std";
import { CharacterId } from "@mp/game-shared";
import { unsafe } from "@mp/validate";
import { defaultSpawnPoint } from "./spawn-point";

/** @gqlQueryField */
export async function characterList(ctx: ApiContext): Promise<Character[]> {
  await roles(ctx, [gatewayRoles.spectate]);
  return promiseFromResult(ctx.ioc.get(ctxDb).selectOnlineCharacterList());
}

/** @gqlQueryField */
export async function myCharacterId(ctx: ApiContext): Promise<CharacterId> {
  const { user } = await auth(ctx);
  return promiseFromResult(
    ctx.ioc.get(ctxDb).selectOrCreateCharacterIdForUser({
      user: user,
      getDefaultSpawnPoint: () => defaultSpawnPoint(ctx),
    }),
  );
}

/** @gqlType */
export interface Character {
  /** @gqlField */
  id: CharacterId;
  /** @gqlField */
  name: string;
}
