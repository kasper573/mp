import { parseEnv } from "@mp/env";
import { authAlgorithms } from "@mp/auth/server";
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
  metadataDbPath: "string",
  /**
   * The secret used by the gateway to authenticate against game-service backends.
   */
  gameServiceSecret: "string",
  /**
   * Comma-separated `areaId=ws://host:port` mapping describing which game-service
   * websocket endpoint serves each area.
   */
  gameServiceUrls: csv(type("string")).pipe((entries) => {
    const map: Record<string, string> = {};
    for (const entry of entries) {
      const idx = entry.indexOf("=");
      if (idx <= 0) {
        throw new Error(
          `Invalid gameServiceUrls entry "${entry}", expected "areaId=url"`,
        );
      }
      const id = entry.slice(0, idx).trim();
      const url = entry.slice(idx + 1).trim();
      if (!id || !url) {
        throw new Error(
          `Invalid gameServiceUrls entry "${entry}", expected "areaId=url"`,
        );
      }
      map[id] = url;
    }
    return map;
  }),
  auth: {
    issuer: "string",
    audience: "string",
    jwksUri: "string",
    algorithms: csv(type.enumerated(...authAlgorithms)),
    /**
     * Allow bypassing JWT verification using fake tokens.
     */
    allowBypassUsers: boolish(),
  },
}).onDeepUndeclaredKey("delete");

export const opt = parseEnv(
  (v) => serverOptionsSchema.assert(v),
  process.env,
  "MP_GATEWAY_",
)._unsafeUnwrap();
