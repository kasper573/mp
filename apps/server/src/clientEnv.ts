import type * as express from "express";
import type { CliOptions } from "./cli";
import {
  clientEnvApiPath,
  clientEnvGlobalVarName,
  trpcEndpointPath,
} from "./settings";

export function getClientEnv(opt: CliOptions): ClientEnv {
  return {
    apiUrl: `${opt.httpBaseUrl}${trpcEndpointPath}`,
    wsUrl: opt.wsBaseUrl,
    authPublishableKey: opt.authPublishableKey,
    buildVersion: opt.buildVersion,
  };
}

/**
 * Runtime environment variables that the server exposes to the client
 */
export interface ClientEnv {
  apiUrl: string;
  wsUrl: string;
  authPublishableKey: string;
  buildVersion: string;
}

export function createClientEnvMiddleware(
  opt: CliOptions,
): express.RequestHandler {
  return (req, res, next) => {
    if (req.path === clientEnvApiPath) {
      const js = `window["${clientEnvGlobalVarName}"] = ${JSON.stringify(getClientEnv(opt))};`;
      res.setHeader("Content-Type", "application/javascript");
      res.send(js);
    } else {
      next();
    }
  };
}
