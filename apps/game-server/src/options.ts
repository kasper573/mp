import { parseEnv } from "@mp/env";
import { boolish, numeric, type } from "@mp/validate";

export type GameServerOptions = typeof gameServerOptionsSchema.infer;

export const gameServerOptionsSchema = type({
  /**
   * The port to listen on for WebSocket connections.
   */
  port: numeric(),
  /**
   * The port to listen on for the Prometheus metrics HTTP server.
   */
  metricsPort: numeric(),
  /**
   * The base URL for loading tiled map files.
   */
  tiledBaseUrl: "string",
  auth: {
    /**
     * The JWKS URI for token verification (e.g. Keycloak certs endpoint).
     */
    jwksUri: "string",
    /**
     * The expected token issuer (e.g. Keycloak realm URL).
     */
    issuer: "string",
    /**
     * The expected token audience.
     */
    audience: "string",
    /**
     * Whether to allow bypass users (tokens prefixed with "bypass:").
     * Should only be enabled in development.
     */
    "allowBypassUsers?": boolish(),
  },
  log: {
    /**
     * Which level of logs to output (see @mp/logger).
     */
    "level?": "string",
    /**
     * Display logs in a pretty, human-readable format.
     */
    "pretty?": boolish(),
  },
}).onDeepUndeclaredKey("delete");

export const opt = parseEnv(
  (v) => gameServerOptionsSchema.assert(v),
  process.env,
  "MP_GAME_SERVER_",
)._unsafeUnwrap();
