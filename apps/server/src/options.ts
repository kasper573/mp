import { TimeSpan } from "@mp/time";
import { authAlgorithms } from "@mp/auth/server";
import { boolish, csv, numeric, type } from "@mp/validate";
import { assertEnv } from "@mp/env";

export type GameServiceOptions = typeof gameServiceOptionsSchema.infer;

const msSchema = numeric().pipe((str) => TimeSpan.fromMilliseconds(str));

export const gameServiceOptionsSchema = type({
  /**
   * The id ofthe area that this game service instance will handle.
   */
  areaId: type("string").brand("AreaId"),
  /**
   * The URL to the gateway WebSocket server.
   */
  gatewayWssUrl: "string",
  /**
   * The URL to the API service
   */
  apiServiceUrl: "string",
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
   * The server tick interval
   */
  tickInterval: msSchema,
  /**
   * How often to save the game state to the database
   */
  persistInterval: msSchema,
  /**
   * Options for prom-client Pushgateway
   */
  metricsPushgateway: {
    /**
     * The URL to the metrics push gateway
     */
    url: "string",
    /**
     * How often to push metrics to the push gateway
     */
    interval: msSchema,
  },
  /**
   * The URL to the database
   */
  databaseUrl: "string",
  /**
   * The version of the game service
   */
  version: "string",
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
}).onDeepUndeclaredKey("delete");

export const opt = assertEnv(
  gameServiceOptionsSchema,
  process.env,
  "MP_SERVER_",
);
