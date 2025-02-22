import { defineConfig } from "npm:vite";
import deno from "npm:@deno/vite-plugin";
import { vanillaExtractPlugin } from "npm:@vanilla-extract/vite-plugin";
import solid from "npm:vite-plugin-solid";
import topLevelAwait from "npm:vite-plugin-top-level-await";
import type { Plugin } from "npm:vite";

export default defineConfig({
  plugins: [
    deno(),
    solid(),
    // @ts-expect-error typescript incorrectly says it's not callable, but it actually is
    topLevelAwait(),
    vanillaExtractPlugin(),
    ...(Deno.env.get("MP_CLIENT_EMBED_ENV") ? [embedEnvPlugin()] : []),
  ],
});

function embedEnvPlugin(): Plugin {
  return {
    name: "embed-client-env",
    transformIndexHtml(html) {
      const env = Object.fromEntries(
        Object.entries(Deno.env.toObject()).filter(([key]) =>
          key.startsWith("MP_CLIENT_")
        ),
      );
      return html.replaceAll("__ENV_PLACEHOLDER__", JSON.stringify(env));
    },
  };
}
