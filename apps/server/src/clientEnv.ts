import type * as express from "express";
import type { BrowserAuthClientOptions } from "@mp/auth/client";
import type { CliOptions } from "./cli";
import {
  clientEnvApiPath,
  clientEnvGlobalVarName,
  trpcEndpointPath,
} from "./shared";

/**
 * Runtime environment variables that the server exposes to the client
 */
export interface ClientEnv {
  apiUrl: string;
  wsUrl: string;
  buildVersion: string;
  auth: BrowserAuthClientOptions & {
    callbackPath: string;
  };
}

export function getClientEnv(opt: CliOptions): ClientEnv {
  return {
    apiUrl: `${opt.httpBaseUrl}${trpcEndpointPath}`,
    wsUrl: opt.wsBaseUrl,
    buildVersion: opt.buildVersion,
    auth: {
      authority: opt.authIssuer,
      audience: opt.authAudience,
      redirectUri: opt.authRedirectUri,
      callbackPath: opt.authCallbackPath,
    },
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
