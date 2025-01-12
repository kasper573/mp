import { createRemoteJWKSet, jwtVerify } from "jose";
import { err, ok, type Result } from "@mp/std";
import type { AuthToken, UserId, UserIdentity } from "./types";

export interface AuthServerOptions {
  jwksUri: string;
  issuer: string;
  audience: string;
  algorithms: AuthAlgorithm[];
}

export interface AuthServer {
  verifyToken(token?: AuthToken): Promise<VerifyTokenResult>;
}

export function createAuthServer({
  jwksUri,
  issuer,
  audience,
  algorithms,
}: AuthServerOptions): AuthServer {
  const jwks = createRemoteJWKSet(new URL(jwksUri));

  return {
    async verifyToken(token) {
      if (token === undefined) {
        return err("A token must be provided");
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

      if (jwtPayload.azp !== audience) {
        return err(`Token azp "${String(jwtPayload.azp)}" is invalid`);
      }

      if (!jwtPayload.sub) {
        return err(`Token payload is missing 'sub' claim`);
      }

      const user: UserIdentity = {
        id: jwtPayload.sub as UserId,
        token,
      };

      return ok(user);
    },
  };
}

export type VerifyTokenResult = Result<UserIdentity, string>;

export * from "./types";

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
