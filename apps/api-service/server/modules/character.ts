import { gatewayRoles } from "@mp/keycloak";
import type { ApiContext } from "../context";
import { ctxCharacterRepo, ctxOnlineCharacterIds } from "../context";
import { auth, roles } from "../integrations/auth";
import { assert } from "@mp/std";
import type { AreaId, CharacterId } from "@mp/world";
import type { FormUpdateResult } from "./form";
import { computeSetChanges, toAsyncIterable } from "@mp/state";
import type { MapChanges } from "../../shared/map-changes";

/** @gqlSubscriptionField */
export async function* onlineCharacters(
  ctx: ApiContext,
): AsyncIterable<MapChanges<CharacterId, Character>> {
  await roles(ctx, [gatewayRoles.spectate]);

  const ids = ctx.ioc.get(ctxOnlineCharacterIds);
  const repo = ctx.ioc.get(ctxCharacterRepo);

  for await (const changes of toAsyncIterable(computeSetChanges(ids))) {
    yield { removed: Array.from(changes.removed) };

    const added = repo.listByIds(Array.from(changes.added));

    yield { added: added.map((value) => ({ value, key: value.id })) };
  }
}

/** @gqlQueryField */
export async function myCharacterId(ctx: ApiContext): Promise<CharacterId> {
  const { user } = await auth(ctx);
  return ctx.ioc.get(ctxCharacterRepo).findOrCreateForUser(user);
}

/** @gqlQueryField */
export async function myCharacter(ctx: ApiContext): Promise<Character | null> {
  const { user } = await auth(ctx);
  const repo = ctx.ioc.get(ctxCharacterRepo);
  repo.findOrCreateForUser(user);
  return repo.findByUser(user.id) ?? null;
}

/** @gqlMutationField */
export async function updateMyCharacter(
  input: UpdateMyCharacterInput,
  ctx: ApiContext,
): Promise<FormUpdateResult<UpdateMyCharacterErrors>> {
  const char = assert(await myCharacter(ctx));

  const res = ctx.ioc
    .get(ctxCharacterRepo)
    .updateName(char.id, input.newName.trim());

  if (res.isErr()) {
    return {
      errors: {
        newName: [`The name "${res.error.name}" is not available.`],
      },
    };
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
  /** @gqlField */
  areaId: AreaId;
}
