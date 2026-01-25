import { parseEnv } from "@mp/env";
import { authAlgorithms } from "@mp/auth/server";
import { boolish, csv, numeric, type } from "@mp/validate";

export type ApiOptions = typeof apiOptionsSchema.infer;

export const apiOptionsSchema = type({
  port: numeric(),
  hostname: "string",
  exposeErrorDetails: boolish(),
  databaseConnectionString: "string",
  log: {
    /**
     * Which level of logs to output (See @mp/logger)
     */
    level: "string?",
    /**
     * Display logs in a pretty, human-readable format.
     */
    pretty: boolish().optional(),
  },
  graphqlWssPath: "string",
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

export const opt = parseEnv(
  (v) => apiOptionsSchema.assert(v),
  process.env,
  "MP_API_",
)._unsafeUnwrap();
