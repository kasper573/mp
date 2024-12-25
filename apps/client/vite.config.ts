import { defineConfig } from "vite";
import { checker } from "vite-plugin-checker";
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";
import solid from "vite-plugin-solid";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import type { Plugin } from "vite";

export default defineConfig({
  plugins: [
    vanillaExtractPlugin(),
    solid(),
    wasm(),
    topLevelAwait(),
    checker({ typescript: true }),
    ...(process.env.MP_CLIENT_EMBED_ENV ? [embedEnvPlugin()] : []),
  ],
});

function embedEnvPlugin(): Plugin {
  return {
    name: "embed-client-env",
    transformIndexHtml(html) {
      const env = Object.fromEntries(
        Object.entries(process.env).filter(([key]) =>
          key.startsWith("MP_CLIENT_"),
        ),
      );
      return html.replaceAll("__ENV_PLACEHOLDER__", JSON.stringify(env));
    },
  };
}
