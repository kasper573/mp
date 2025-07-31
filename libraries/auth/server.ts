import { createRemoteJWKSet, jwtVerify } from "jose";
import { err, ok, type Result } from "@mp/std";
import type { RoleDefinition } from "./shared";
import {
  createUserIdentity,
  isOurJwtPayload,
  parseBypassUser,
  type AccessToken,
  type UserIdentity,
} from "./shared";

export interface TokenResolverOption {
  jwksUri: string;
  issuer: string;
  audience: string;
  algorithms: AuthAlgorithm[];
  /**
   * Allow bypassing real JWT verification.
   */
  allowBypassUsers?: boolean;
  /**
   * Give these roles to bypass users automatically.
   */
  bypassUserRoles?: Iterable<RoleDefinition>;
  /**
   * Optional callback to handle the result of the token resolution.
   * This can be used for logging or other side effects.
   */
  onResolve?: (result: TokenResolverResult) => void;
}

export type TokenResolver = (
  token?: AccessToken,
) => Promise<TokenResolverResult>;

export function createTokenResolver({
  jwksUri,
  issuer,
  audience,
  algorithms,
  allowBypassUsers,
  bypassUserRoles,
  onResolve,
}: TokenResolverOption): TokenResolver {
  const jwks = createRemoteJWKSet(new URL(jwksUri));

  const resolveToken: TokenResolver = async (token) => {
    if (token === undefined) {
      return err("A token must be provided");
    }

    const bypassUser = allowBypassUsers
      ? parseBypassUser(token, bypassUserRoles)
      : undefined;
    if (bypassUser) {
      return ok(bypassUser);
    }

    let jwtPayload;
    try {
      const { payload } = await jwtVerify(token, jwks, {
        issuer,
        algorithms,
      });
      jwtPayload = payload;
    } catch (error) {
      return err(String(error));
    }

    if (!isOurJwtPayload(jwtPayload)) {
      return err("Token payload is not valid");
    }

    if (jwtPayload.azp !== audience) {
      return err(`Token azp "${String(jwtPayload.azp)}" is invalid`);
    }

    if (!jwtPayload.sub) {
      return err(`Token payload is missing 'sub' claim`);
    }

    const user = createUserIdentity(token, jwtPayload);

    return ok(user);
  };

  return async (token) => {
    const result = await resolveToken(token);
    onResolve?.(result);
    return result;
  };
}

export type TokenResolverResult = Result<UserIdentity, string>;

// Current implementation only supports asymmetric algorithms
export const authAlgorithms = [
  "RS256",
  "RS384",
  "RS512",
  "ES256",
  "ES384",
  "ES512",
  "PS256",
  "PS384",
  "PS512",
  "none",
] as const;

export type AuthAlgorithm = (typeof authAlgorithms)[number];
