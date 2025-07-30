import { authAlgorithms } from "@mp/auth/server";
import { assertEnv } from "@mp/env";
import { boolish, csv, numeric, type } from "@mp/validate";

export type ApiOptions = typeof apiOptionsSchema.infer;

export const apiOptionsSchema = type({
  port: numeric(),
  hostname: "string",
  exposeErrorDetails: boolish(),
  databaseConnectionString: "string",
  prettyLogs: boolish(),
  fileServerInternalUrl: "string",
  fileServerPublicUrl: "string",
  version: "string",
  redisPath: "string",
  auth: {
    /**
     * OIDC issuer
     */
    issuer: "string",
    /**
     * OIDC audience
     */
    audience: "string",
    /**
     * OIDC JWKS URI
     */
    jwksUri: "string",
    /**
     * OIDC JWT algorithms
     */
    algorithms: csv(type.enumerated(...authAlgorithms)),
    /**
     * Allow bypassing JWT verification using fake tokens.
     * Used by load test to automatically sign in as a new user and character.
     */
    allowBypassUsers: boolish(),
  },
}).onDeepUndeclaredKey("delete");

export const opt = assertEnv(apiOptionsSchema, process.env, "MP_API_");
