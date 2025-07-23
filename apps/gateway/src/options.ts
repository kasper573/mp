import { boolish, numeric, type } from "@mp/validate";
import { assertEnv } from "@mp/env";

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
   * The CORS origin to allow
   */
  corsOrigin: "string",
  /**
   * Whether to show pretty logs (Useful for development)
   */
  prettyLogs: boolish(),
  /**
   * Whether to trust the X-Forwarded-For header
   */
  trustProxy: boolish(),
  apiEndpointPath: "string",
  apiServiceUrl: "string",
}).onDeepUndeclaredKey("delete");

export const opt = assertEnv(serverOptionsSchema, process.env, "MP_GATEWAY_");
