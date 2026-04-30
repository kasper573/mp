import { parseEnv } from "@mp/env";
import { authAlgorithms } from "@mp/auth/server";
import { boolish, csv, numeric, type } from "@mp/validate";

export type GameServerOptions = typeof gameServerOptionsSchema.infer;

export const gameServerOptionsSchema = type({
  port: numeric(),
  wsEndpointPath: "string",
  hostname: "string",
  databaseConnectionString: "string",
  fileServerBaseUrl: "string",
  tickRateHz: numeric(),
  syncIntervalMs: numeric(),
  log: {
    level: "string?",
    pretty: boolish().optional(),
  },
  auth: {
    issuer: "string",
    audience: "string",
    jwksUri: "string",
    algorithms: csv(type.enumerated(...authAlgorithms)),
    allowBypassUsers: boolish(),
  },
}).onDeepUndeclaredKey("delete");

export const opt = parseEnv(
  (v) => gameServerOptionsSchema.assert(v),
  process.env,
  "MP_GAME_SERVER_",
)._unsafeUnwrap();
