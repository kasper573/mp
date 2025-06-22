import type { RoleDefinition, UserId } from "@mp/auth";
import { InjectionContext } from "@mp/ioc";

export interface UserService {
  getName(userId: UserId): Promise<string>;
  getRoles(userId: UserId): Promise<ReadonlySetLike<RoleDefinition>>;
}

export const ctxUserService = InjectionContext.new<UserService>("UserService");
