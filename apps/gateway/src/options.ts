import { assertEnv } from "@mp/env";
import { authAlgorithms } from "@mp/oauth/server";
import { boolish, csv, numeric, type } from "@mp/validate";

export type ServerOptions = typeof serverOptionsSchema.infer;

export const serverOptionsSchema = type({
  /**
   * The port to listen on
   */
  port: numeric(),
  /**
   * The relative path to expose the WS endpoint on
   */
  wsEndpointPath: "string",
  /**
   * The hostname for the server to listen on
   */
  hostname: "string",
  /**
   * Whether to show pretty logs (Useful for development)
   */
  prettyLogs: boolish(),
  databaseConnectionString: "string",
  /**
   * The secret that must be provided in the WebSocket handshake to be allowed to register as a game service.
   */
  gameServiceSecret: "string",
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

export const opt = assertEnv(serverOptionsSchema, process.env, "MP_GATEWAY_");
