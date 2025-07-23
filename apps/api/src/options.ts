import { boolish, csv, numeric, type } from "@mp/validate";
import { assertEnv } from "@mp/env";
import { authAlgorithms } from "@mp/auth/server";

export type ApiOptions = typeof apiOptionsSchema.infer;

export const apiOptionsSchema = type({
  port: numeric(),
  hostname: "string",
  exposeErrorDetails: boolish(),
  prettyLogs: boolish(),
  version: "string",
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
  },
}).onDeepUndeclaredKey("delete");

export const opt = assertEnv(apiOptionsSchema, process.env, "MP_API_");
