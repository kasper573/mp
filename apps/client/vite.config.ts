import { defineConfig } from "vite";
import deno from "@deno/vite-plugin";
import solid from "vite-plugin-solid";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";

import { clientEnvGlobalVarName, clientEnvSchema } from "@mp/server";
import { parseEnv } from "@mp/env";
import type { Plugin } from "vite";

export default defineConfig(({ mode }) => ({
  plugins: [
    deno(),
    solid(),
    // @ts-expect-error Poor typedefs in package causes not callable error
    wasm(),
    // @ts-expect-error Poor typedefs in package causes not callable error
    topLevelAwait(),
    vanillaExtractPlugin(),
    ...(mode === "development" ? [clientEnvPlugin()] : []),
  ],
  server: {
    fs: {
      // TODO figure out a way to specifically allow only @fontsource in deno and turn strict mode back on
      strict: false,
    },
  },
}));

function clientEnvPlugin(): Plugin {
  const res = parseEnv(clientEnvSchema, Deno.env.toObject(), "MP_CLIENT_");
  if (res.isErr()) {
    throw new Error("Failed to parse client env:\n" + res.error);
  }
  return {
    name: "vite-plugin-mp-client-env",
    transformIndexHtml(html) {
      return html.replaceAll(
        "__WILL_BE_REPLACED_WITH_ENV_VARS_SCRIPT__",
        `window["${clientEnvGlobalVarName}"] = ${JSON.stringify(res.value)};`,
      );
    },
  };
}
