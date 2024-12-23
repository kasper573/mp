import * as fs from "node:fs";
import path from "node:path";
import * as express from "express";
import { parseEnv } from "@mp/env";
import { clientEnvGlobalVarName } from "../shared";
import { clientEnvSchema } from "../package";

/**
 * Serves the prebuilt client artifacts from the given directory.
 * Will embed client env vars into the index.html before serving.
 */
export function clientMiddleware(
  clientDir: string,
  staticOptions?: { maxAge?: string | number },
): express.RequestHandler {
  const clientEnv = parseEnv(clientEnvSchema, process.env, "MP_CLIENT_");
  if (clientEnv.isErr()) {
    throw new Error("Client env invalid or missing:\n" + clientEnv.error);
  }

  const indexHtml = fs.readFileSync(
    path.resolve(clientDir, "index.html"),
    "utf8",
  );

  const patchedHtml = indexHtml.replace(
    "__WILL_BE_REPLACED_WITH_ENV_VARS_SCRIPT__",
    `window["${clientEnvGlobalVarName}"]=${JSON.stringify(clientEnv.value)};`,
  );

  const serveStatic = express.static(clientDir, staticOptions);
  const indexPaths = new Set(["/", "/index.html"]);

  function serveIndex(res: express.Response) {
    res.setHeader("Content-Type", "text/html");
    res.send(patchedHtml);
  }

  return (req, res) => {
    if (indexPaths.has(req.url)) {
      serveIndex(res);
    } else {
      serveStatic(req, res, () => {
        if (!res.headersSent) {
          serveIndex(res);
        }
      });
    }
  };
}
