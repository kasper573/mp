import { clientEnvGlobalVarName, clientEnvSchema } from "@mp/server";
import { parseEnv } from "@mp/env";
import { defineConfig } from "vite";
import type { Plugin } from "vite";
import { checker } from "vite-plugin-checker";
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";
import solid from "vite-plugin-solid";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";

export default defineConfig({
  plugins: [
    vanillaExtractPlugin(),
    solid(),
    wasm(),
    topLevelAwait(),
    checker({ typescript: true }),
    ...(process.env.MP_BUNDLE_CLIENT_ENV ? [clientEnvPlugin()] : []),
  ],
});

function clientEnvPlugin(): Plugin {
  const res = parseEnv(clientEnvSchema, process.env, "MP_CLIENT_");
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
