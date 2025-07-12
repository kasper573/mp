import { defineConfig } from "vite";
import { checker } from "vite-plugin-checker";
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";
import tanstackRouterPlugin from "@tanstack/router-plugin/vite";
import preact from "@preact/preset-vite";

import type { Plugin } from "vite";

export default defineConfig({
  esbuild: {
    target: "es2022", // Required for decorators
  },
  plugins: [
    tanstackRouterPlugin({
      target: "react",
      routeFilePrefix: "~",
      routesDirectory: "src/routes",
      generatedRouteTree: "src/integrations/router/routeTree.gen.ts",
      autoCodeSplitting: true,
    }),
    disallowExternalizingPlugin(),
    vanillaExtractPlugin(),
    preact(),
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

// This warning usually shows up when a server module is being bundled into the client,
// which is almost always an error in this repo, so we disallow it.
function disallowExternalizingPlugin(): Plugin {
  return {
    name: "error-on-externalized-modules",
    configResolved(config) {
      config.logger.warn = (message) => {
        if (message.includes("has been externalized")) {
          throw new Error(`Externalizing is not allowed: ${message}`);
        }
        // eslint-disable-next-line no-console
        console.warn(message); // Preserve other warnings
      };
    },
  };
}
