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
    auth: {
      publishableKey: opt.authPublishableKey,
    },
    buildVersion: opt.buildVersion,
  };
}

/**
 * Runtime environment variables that the server exposes to the client
 */
export interface ClientEnv {
  buildVersion: string;
  apiUrl: string;
  wsUrl: string;
  auth: {
    publishableKey: string;
  };
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
