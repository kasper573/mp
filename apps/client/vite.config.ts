import type { Plugin } from "vite";
import { clientEnvGlobalVarName, clientEnvSchema } from "@mp/server";
import { defineConfig } from "@mp/build/vite";
import { parseEnv } from "@mp/env";

export default defineConfig({
  plugins: process.env.MP_BUNDLE_CLIENT_ENV ? [clientEnvPlugin()] : [],
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
