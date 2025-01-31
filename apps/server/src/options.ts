import path from "node:path";
import { TimeSpan } from "@mp/time";
import { authAlgorithms } from "@mp/auth/server";
import type { InferOutput } from "@mp/env";
import {
  boolish,
  csv,
  numeric,
  object,
  optional,
  picklist,
  pipe,
  string,
  transform,
} from "@mp/env";

export type ServerOptions = InferOutput<typeof serverOptionsSchema>;

export const serverOptionsSchema = object({
  /**
   * If provided, serves the client from this directory. Otherwise, assumes the client is served as a separate app.
   */
  clientDir: pipe(
    optional(string()),
    transform((p) => p && path.resolve(p)),
  ),
  /**
   * The directory to serve static files from
   */
  publicDir: pipe(
    string(),
    transform((p) => path.resolve(p)),
  ),
  /**
   * The relative path after the hostname where the public dir will be exposed
   */
  publicPath: string(),
  /**
   * The max age of files served from the public directory in seconds
   */
  publicMaxAge: numeric(),
  /**
   * Whether to trust the X-Forwarded-For header
   */
  trustProxy: boolish(),
  /**
   * The port to listen on
   */
  port: numeric(),
  /**
   * Used for generating publicly accessible URLs to the HTTP server
   */
  httpBaseUrl: string(),
  /**
   * The relative path to expose the API endpoint on
   */
  apiEndpointPath: string(),
  /**
   * The relative path to expose the WS endpoint on
   */
  wsEndpointPath: string(),
  /**
   * The hostname for the server to listen on
   */
  hostname: string(),
  /**
   * The CORS origin to allow
   */
  corsOrigin: string(),

  auth: object({
    /**
     * OIDC issuer
     */
    issuer: string(),
    /**
     * OIDC audience
     */
    audience: string(),
    /**
     * OIDC JWKS URI
     */
    jwksUri: string(),
    /**
     * OIDC JWT algorithms
     */
    algorithms: csv(picklist(authAlgorithms)),
  }),

  /**
   * The server tick interval in milliseconds
   */
  tickInterval: pipe(
    numeric(),
    transform((ms) => TimeSpan.fromMilliseconds(ms)),
  ),
  /**
   * How often (in milliseconds) to save the world state to the database
   */
  persistInterval: pipe(
    numeric(),
    transform((ms) => TimeSpan.fromMilliseconds(ms)),
  ),
  /**
   * Whether to log server state changes that are sent to clients
   */
  logSyncPatches: boolish(),
  /**
   * The URL to the database
   */
  databaseUrl: string(),
  /**
   * The version of the build
   */
  buildVersion: string(),
  /**
   * Whether to expose detailed error information to clients
   */
  exposeErrorDetails: boolish(),
});
