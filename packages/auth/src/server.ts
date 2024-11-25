import { createRemoteJWKSet, jwtVerify } from "jose";
import type { AuthToken, UserId, UserIdentity } from "./shared";

export interface AuthServerOptions {
  jwksUri: string;
  issuer: string;
  audience: string;
  algorithms: AuthAlgorithm[];
}

export interface AuthServer {
  verifyToken(token: AuthToken): Promise<VerifyTokenResult>;
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
      let jwtPayload;
      try {
        const { payload } = await jwtVerify(token, jwks, {
          issuer,
          algorithms,
        });
        jwtPayload = payload;
      } catch (error) {
        return { ok: false, error: String(error) };
      }

      if (jwtPayload.azp !== audience) {
        return {
          ok: false,
          error: `Token azp "${String(jwtPayload.azp)}" is invalid`,
        };
      }

      if (!jwtPayload.sub) {
        return { ok: false, error: `Token payload is missing 'sub' claim` };
      }

      const user: UserIdentity = {
        id: jwtPayload.sub as UserId,
        token,
      };

      return { ok: true, user };
    },
  };
}

type VerifyTokenResult =
  | { ok: true; user: UserIdentity }
  | { ok: false; error: string };

export * from "./shared";

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
