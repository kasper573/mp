import type { RoleDefinition, UserId } from "@mp/auth";
import { InjectionContext } from "@mp/ioc";
import type { CharacterId } from "../character/types";

export const ctxUserSession = InjectionContext.new<UserSession>("UserSession");

export interface UserSession<Id extends string = string> {
  readonly id: Id;

  /**
   * Set when the user is authenticated
   */
  readonly user?: Readonly<{
    id: UserId;
    roles: ReadonlySetLike<RoleDefinition>;
    name: string;
  }>;

  /**
   * The character id that the user will be subscribing to game state patches and events for
   */
  readonly characterId?: CharacterId;
}
