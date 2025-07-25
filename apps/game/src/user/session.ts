import type { RoleDefinition, UserId } from "@mp/auth";
import { InjectionContext } from "@mp/ioc";
import type { CharacterId } from "../character/types";

export const ctxUserSession = InjectionContext.new<UserSession>("UserSession");

export interface UserSession {
  id: string;
  user?: {
    id: UserId;
    roles: ReadonlySetLike<RoleDefinition>;
  };
  player?: {
    characterId: CharacterId;
    clientType: "spectator" | "player";
  };
}
