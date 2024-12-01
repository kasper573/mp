import * as fs from "node:fs/promises";
import type * as express from "express";
import type { ClientEnv } from "./shared";
import { clientEnvGlobalVarName } from "./shared";

export function serveClientIndexWithEnv(
  indexFile: string,
  clientEnv: ClientEnv,
): express.RequestHandler {
  const indexHtmlPromise = fs.readFile(indexFile, "utf8").then((html) => {
    html.replace(
      "__WILL_BE_REPLACED_WITH_ENV_VARS_SCRIPT__",
      `window["${clientEnvGlobalVarName}"]=${JSON.stringify(clientEnv)};`,
    );
  });

  return (_, res) => {
    indexHtmlPromise
      .then((html) => {
        res.setHeader("Content-Type", "text/html");
        res.send(html);
      })
      .catch(() => {
        res.status(500).send("Something went wrong");
      });
  };
}
