import { TimeSpan } from "@mp/time";
import { authAlgorithms } from "@mp/auth/server";
import { boolish, csv, numeric, type } from "@mp/validate";
import { assertEnv } from "@mp/env";

export type ServerOptions = typeof serverOptionsSchema.infer;

const msSchema = numeric().pipe((str) => TimeSpan.fromMilliseconds(str));

export const serverOptionsSchema = type({
  /**
   * Whether to trust the X-Forwarded-For header
   */
  trustProxy: boolish(),
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
   * The CORS origin to allow
   */
  corsOrigin: "string",

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
  /**
   * The server tick interval in milliseconds
   */
  tickInterval: msSchema,
  /**
   * How often (in milliseconds) to save the game state to the database
   */
  persistInterval: msSchema,
  /**
   * The URL to the database
   */
  databaseUrl: "string",
  /**
   * The version of the game server
   */
  version: "string",
  /**
   * Whether to expose detailed error information to clients
   */
  exposeErrorDetails: boolish(),
  /**
   * Whether to enable rate limiting
   */
  rateLimit: boolish(),

  /**
   * The seed to use for the random number generator.
   * If not provided, a random seed will be used.
   */
  "rngSeed?": numeric(),

  /**
   * Set to true to enable the patch optimizer on the server side.
   */
  patchOptimizer: boolish(),

  /**
   * Whether to use pretty logging format.
   */
  prettyLogs: boolish(),
  /**
   * The URL to the API service
   */
  apiUrl: "string",
}).onDeepUndeclaredKey("delete");

export const opt = assertEnv(serverOptionsSchema, process.env, "MP_SERVER_");
