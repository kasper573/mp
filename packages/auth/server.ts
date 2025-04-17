import { createRemoteJWKSet, jwtVerify } from "jose";
import { err, ok, type Result } from "@mp/std";
import {
  isOurJwtPayload,
  type AuthToken,
  type UserId,
  type UserIdentity,
} from "./shared";

export interface TokenVerifierOption {
  jwksUri: string;
  issuer: string;
  audience: string;
  algorithms: AuthAlgorithm[];
  /**
   * A user that will bypass token verification
   */
  bypassUser?: UserIdentity;
}

export interface TokenVerifier {
  (token?: AuthToken): Promise<TokenVerifierResult>;
}

export function createTokenVerifier({
  jwksUri,
  issuer,
  audience,
  algorithms,
  bypassUser,
}: TokenVerifierOption): TokenVerifier {
  const jwks = createRemoteJWKSet(new URL(jwksUri));

  return async function verifyToken(token) {
    if (token === undefined) {
      return err("A token must be provided");
    }

    if (token === bypassUser?.token) {
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

    const user: UserIdentity = {
      id: jwtPayload.sub as UserId,
      token,
      roles: new Set(jwtPayload.realm_access.roles),
      name: jwtPayload.preferred_username
        ? String(jwtPayload.preferred_username)
        : undefined,
    };

    return ok(user);
  };
}

export type TokenVerifierResult = Result<UserIdentity, string>;

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
