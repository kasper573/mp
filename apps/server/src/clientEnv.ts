import type * as express from "express";
import type { CliOptions } from "./cli";
import {
  clientEnvApiPath,
  clientEnvGlobalVarName,
  trpcEndpointPath,
} from "./settings";

export function getClientEnv(opt: CliOptions): ClientEnv {
  const httpProtocol = opt.ssl ? "https" : "http";
  const wsProtocol = opt.ssl ? "wss" : "ws";
  return {
    apiUrl: `${httpProtocol}://${opt.hostname}:${opt.port}${trpcEndpointPath}`,
    wsUrl: `${wsProtocol}://${opt.hostname}:${opt.port}`,
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
    if (req.url !== clientEnvApiPath) {
      return next();
    }

    const js = `window["${clientEnvGlobalVarName}"] = ${JSON.stringify(getClientEnv(opt))};`;
    res.setHeader("Content-Type", "application/javascript");
    res.send(js);
  };
}
