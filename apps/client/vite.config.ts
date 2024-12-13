import { defineConfig } from "vite";
import deno from "@deno/vite-plugin";
import solid from "vite-plugin-solid";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    deno(),
    solid(),
    // @ts-expect-error Poor typedefs in package causes not callable error
    wasm(),
    // @ts-expect-error Poor typedefs in package causes not callable error
    topLevelAwait(),
    vanillaExtractPlugin(),
  ],
});

// import { clientEnvGlobalVarName, clientEnvSchema } from "@mp/server";
// import { parseEnv } from "@mp/env";
// import type { Plugin } from "vite";
// import { defineConfig } from "vite";
// import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";
// import process from "node:process";
// import deno from "@deno/vite-plugin";
// import solid from "vite-plugin-solid";

// export default defineConfig({
//   plugins: [
//     deno(),
//     vanillaExtractPlugin(),
//     solid(),
//     ...(Deno.env("MP_BUNDLE_CLIENT_ENV") ? [clientEnvPlugin()] : []),
//   ],
// });

// function clientEnvPlugin(): Plugin {
//   const res = parseEnv(clientEnvSchema, Deno.env.toObject(), "MP_CLIENT_");
//   if (res.isErr()) {
//     throw new Error("Failed to parse client env:\n" + res.error);
//   }
//   return {
//     name: "vite-plugin-mp-client-env",
//     transformIndexHtml(html) {
//       return html.replaceAll(
//         "__WILL_BE_REPLACED_WITH_ENV_VARS_SCRIPT__",
//         `window["${clientEnvGlobalVarName}"] = ${JSON.stringify(res.value)};`
//       );
//     },
//   };
// }
