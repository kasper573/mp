import type { RoleDefinition, UserId } from "@mp/auth";
import { InjectionContext } from "@mp/ioc";
import type { CharacterId } from "../character/types";
import type { Branded } from "@mp/std";

export const ctxUserSession = InjectionContext.new<UserSession>("UserSession");

export type UserSessionId = Branded<string, "UserSessionId">;

export interface UserSession {
  id: UserSessionId;
  userId: UserId;
  characterId: CharacterId;
  roles: ReadonlySetLike<RoleDefinition>;
}
