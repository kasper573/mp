import type { GetPublicKeyOrSecret, JwtPayload } from "jsonwebtoken";
import jwt from "jsonwebtoken";
import createJwksClient from "jwks-rsa";
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
  const jwks = createJwksClient({ jwksUri, cache: true });

  const getKey: GetPublicKeyOrSecret = (header, callback) => {
    jwks.getSigningKey(header.kid, (err, key) => {
      if (err) {
        callback(err);
      } else {
        callback(null, key?.getPublicKey());
      }
    });
  };

  function verifyAndDecode(token: string) {
    return new Promise<JwtPayload>((resolve, reject) => {
      jwt.verify(
        token,
        getKey,
        { audience, issuer, algorithms },
        (err, decoded) => {
          if (err) {
            reject(err);
          } else {
            resolve(decoded as JwtPayload);
          }
        },
      );
    });
  }

  return {
    async verifyToken(token) {
      let jwtPayload;
      try {
        jwtPayload = await verifyAndDecode(token);
      } catch (error) {
        return { ok: false, error: String(error) };
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

export const authAlgorithms = [
  "HS256",
  "HS384",
  "HS512",
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
