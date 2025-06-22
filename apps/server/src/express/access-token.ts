import type { AccessToken } from "@mp/auth";
import type express from "express";

export function deriveAccessToken(
  req: express.Request,
): AccessToken | undefined {
  const parsedBearerToken =
    req.headers["authorization"]?.match(/^Bearer (.+)$/);

  if (parsedBearerToken) {
    return parsedBearerToken[1] as AccessToken;
  }
}
