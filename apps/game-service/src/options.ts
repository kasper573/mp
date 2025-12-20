import { parseEnv } from "@mp/env";
import { AreaIdType } from "@mp/game-shared";
import { TimeSpan } from "@mp/time";
import { boolish, numeric, type } from "@mp/validate";

export type GameServiceOptions = typeof gameServiceOptionsSchema.infer;

const msSchema = numeric().pipe((str) => TimeSpan.fromMilliseconds(str));

export const gameServiceOptionsSchema = type({
  /**
   * The id ofthe area that this game service instance will handle.
   */
  areaId: AreaIdType,
  /**
   * The URL to the gateway WebSocket server.
   */
  gatewayWssUrl: "string",
  /**
   * The secret used to authenticate with the gateway web socket server.
   */
  gatewaySecret: "string",
  /**
   * The URL to the API service
   */
  apiServiceUrl: "string",
  /**
   * The path to the redis server to use for game service config
   */
  redisPath: "string",
  /**
   * The server tick interval
   */
  tickInterval: msSchema,
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
  databaseConnectionString: "string",
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
   * Whether to use pretty logging format.
   */
  prettyLogs: boolish(),
}).onDeepUndeclaredKey("delete");

export const opt = parseEnv(
  (v) => gameServiceOptionsSchema.assert(v),
  process.env,
  "MP_GAME_SERVICE_",
)._unsafeUnwrap();
