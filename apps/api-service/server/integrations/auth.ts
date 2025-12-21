import {
  assertRoles,
  UserIdentity,
  type RoleDefinition,
  type UserId,
} from "@mp/oauth";
import { ApiContext, ctxAccessToken, ctxTokenResolver } from "../context";
import { GraphQLError } from "graphql";

export async function auth(ctx: ApiContext): Promise<AuthContext> {
  const res = await resolveAuth(ctx);
  if (res.isErr()) {
    throw new GraphQLError("Unauthorized", {
      originalError: new Error(res.error),
      extensions: { code: "UNAUTHORIZED" },
    });
  }
  return { user: res.value };
}

export async function roles(
  inputContext: ApiContext,
  requiredRoles: RoleDefinition[],
): Promise<AuthContext> {
  const authContext = await auth(inputContext);
  const requiredRolesSet = new Set(requiredRoles);

  const result = assertRoles(requiredRolesSet, authContext.user.roles);
  if (result.isErr()) {
    throw new GraphQLError("Unauthorized", {
      originalError: new Error(result.error),
      extensions: { code: "FORBIDDEN" },
    });
  }
  return authContext;
}

export async function optionalAuth(
  ctx: ApiContext,
): Promise<Partial<AuthContext>> {
  const res = await resolveAuth(ctx);
  return { user: res.unwrapOr(undefined) };
}

function resolveAuth(ctx: ApiContext) {
  const token = ctx.ioc.get(ctxAccessToken);
  const resolve = ctx.ioc.get(ctxTokenResolver);
  return resolve(token);
}

export interface AuthContext {
  user: UserIdentity;
}
