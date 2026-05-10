import { parseEnv } from "@mp/env";
import type { AuthAlgorithm } from "@mp/auth/server";

export interface GameServerOptions {
  port: number;
  wsEndpointPath: string;
  hostname: string;
  databaseConnectionString: string;
  fileServerBaseUrl: string;
  tickRateHz: number;
  syncIntervalMs: number;
  log: {
    level?: string;
    pretty?: boolean;
  };
  auth: {
    issuer: string;
    audience: string;
    jwksUri: string;
    algorithms: AuthAlgorithm[];
    allowBypassUsers: boolean;
  };
}

export const opt = parseEnv<GameServerOptions>(
  process.env,
  "MP_GAME_SERVER_",
)._unsafeUnwrap();
