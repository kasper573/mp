import * as fs from "node:fs";
import path from "node:path";
import { parseEnv } from "@mp/env";
import { clientEnvGlobalVarName } from "./shared.ts";
import { clientEnvSchema } from "./package.ts";
import { createMiddleware } from "@hono/hono/factory";
import { serveStatic } from "@hono/hono/deno";
import type { MiddlewareHandler } from "@hono/hono";

/**
 * Serves the prebuilt client artifacts from the given directory.
 * Will embed client env vars into the index.html before serving.
 */
export function clientMiddlewares(
  clientDir: string,
  cache: MiddlewareHandler,
) {
  const clientEnv = parseEnv(
    clientEnvSchema,
    Deno.env.toObject(),
    "MP_CLIENT_",
  );
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

  const indexPaths = new Set(["/", "/index.html"]);

  function createIndexResponse() {
    return Promise.resolve(
      new Response(patchedHtml, {
        status: 200,
        headers: {
          "Content-Type": "text/html",
        },
      }),
    );
  }

  return [
    createMiddleware(async (ctx, next) => {
      if (indexPaths.has(ctx.req.url)) {
        ctx.res = await createIndexResponse();
      } else {
        await next();
      }
    }),
    cache,
    serveStatic({ root: clientDir }),
    createMiddleware(createIndexResponse),
  ];
}
