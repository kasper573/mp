import type { AuthToken } from "@mp/auth";
import type express from "express";

export function deriveAuthToken(req: express.Request): AuthToken | undefined {
  const parsedBearerToken =
    req.headers["authorization"]?.match(/^Bearer (.+)$/);

  if (parsedBearerToken) {
    return parsedBearerToken[1] as AuthToken;
  }
}
