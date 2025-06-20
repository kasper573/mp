import { InjectionContext } from "@mp/ioc";
import type { RoleDefinition, UserIdentity } from "@mp/auth";
import type { TokenResolver } from "@mp/auth/server";
import { rpc } from "../rpc";

export const ctxTokenResolver =
  InjectionContext.new<TokenResolver>("TokenResolver");

export function auth() {
  return rpc.middleware(async ({ ctx, headers }): Promise<AuthContext> => {
    const tokenResolver = ctx.get(ctxTokenResolver);
    const result = await tokenResolver(headers.authToken);
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
  return rpc.middleware(
    async ({ ctx, headers }): Promise<Partial<AuthContext>> => {
      const tokenResolver = ctx.get(ctxTokenResolver);
      const result = await tokenResolver(headers.authToken);
      return { user: result.unwrapOr(undefined) };
    },
  );
}

export interface AuthContext {
  user: UserIdentity;
}
