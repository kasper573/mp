import type { RoleDefinition, UserId } from "@mp/auth";
import { InjectionContext } from "@mp/ioc";
import type { CharacterId } from "../character/types";
import type { Branded } from "@mp/std";

export const ctxGameplaySession =
  InjectionContext.new<GameplaySession>("GameplaySession");

export type GameplaySessionId = Branded<string, "GameplaySessionId">;

export interface GameplaySession {
  id: GameplaySessionId;
  userId: UserId;
  characterId: CharacterId;
  roles: ReadonlySetLike<RoleDefinition>;
}
