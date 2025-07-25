import type { RoleDefinition, UserId } from "@mp/auth";
import { InjectionContext } from "@mp/ioc";
import type { CharacterId } from "../character/types";

export const ctxGameplaySession =
  InjectionContext.new<GameplaySession>("GameplaySession");

export interface GameplaySession {
  userId: UserId;
  characterId: CharacterId;
  roles: ReadonlySetLike<RoleDefinition>;
}
