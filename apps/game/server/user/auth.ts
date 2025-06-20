import { InjectionContext } from "@mp/ioc";
import type { RoleDefinition, UserIdentity } from "@mp/auth";
import type { TokenResolver } from "@mp/auth/server";
import { rpc } from "../rpc";
import { ctxClientRegistry } from "./client-registry";
import { ctxClientId } from "./client-id";

export const ctxTokenResolver =
  InjectionContext.new<TokenResolver>("TokenResolver");

export function auth() {
  return rpc.middleware(async ({ ctx }): Promise<AuthContext> => {
    const clientId = ctx.get(ctxClientId);
    const clients = ctx.get(ctxClientRegistry);
    const tokenResolver = ctx.get(ctxTokenResolver);
    const token = clients.getAuthToken(clientId);
    const result = await tokenResolver(token);
    if (result.isErr()) {
      throw new Error("Invalid token", { cause: result.error });
    }
    return { user: result.value };
  });
}

export function roles(requiredRoles: RoleDefinition[]) {
  return auth().pipe(({ mwc }) => {
    if (!new Set(requiredRoles).isSubsetOf(mwc.user.roles)) {
      throw new Error("Insufficient permissions");
    }

    return mwc;
  });
}

export function optionalAuth() {
  return rpc.middleware(async ({ ctx }): Promise<Partial<AuthContext>> => {
    const clientId = ctx.get(ctxClientId);
    const clients = ctx.get(ctxClientRegistry);
    const tokenResolver = ctx.get(ctxTokenResolver);
    const token = clients.getAuthToken(clientId);
    const result = await tokenResolver(token);
    return { user: result.unwrapOr(undefined) };
  });
}

export interface AuthContext {
  user: UserIdentity;
}
