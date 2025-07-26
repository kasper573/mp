import type { RoleDefinition, UserId } from "@mp/auth";
import { InjectionContext } from "@mp/ioc";
import type { CharacterId } from "../character/types";

export const ctxUserSession = InjectionContext.new<UserSession>("UserSession");

export interface UserSession {
  id: string;

  /**
   * Set when the user is authenticated
   */
  user?: {
    id: UserId;
    roles: ReadonlySetLike<RoleDefinition>;
  };

  /**
   * The character id that the user will be subscribing to game state patches and events for
   */
  characterId?: CharacterId;
}
