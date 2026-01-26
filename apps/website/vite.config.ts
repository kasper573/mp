import * as babel from "@babel/core";
import tanstackRouterPlugin from "@tanstack/router-plugin/vite";
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";
import { defineConfig } from "vite";
import { checker } from "vite-plugin-checker";
import solid from "vite-plugin-solid";

import type { Plugin } from "vite";

export default defineConfig({
  resolve: {
    // Ensure SolidJS uses browser builds for reactivity to work correctly
    conditions: ["browser"],
  },
  build: {
    sourcemap: true,
  },
  esbuild: {
    // Disable esbuild's JSX transform for TSX - vite-plugin-solid handles this
    jsx: "preserve",
  },
  optimizeDeps: {
    // Exclude TanStack solid packages from pre-bundling so they can be transformed by vite-plugin-solid
    exclude: [
      "@tanstack/solid-router",
      "@tanstack/solid-query",
      "@tanstack/solid-query-devtools",
    ],
    esbuildOptions: {
      jsx: "preserve",
    },
  },
  plugins: [
    tanstackRouterPlugin({ target: "solid" }),
    disallowExternalizingPlugin(),
    vanillaExtractPlugin(),
    solid(),
    // Transform code-split modules that contain JSX using babel-preset-solid
    // This is needed because vite-plugin-solid doesn't transform virtual modules
    // with query parameters created by TanStack Router's code splitting
    codeSplitJsxTransformPlugin(),
    checker({ typescript: true }),
    ...(process.env.MP_WEBSITE_EMBED_ENV ? [embedEnvPlugin()] : []),
  ],
});

function embedEnvPlugin(): Plugin {
  return {
    name: "embed-client-env",
    transformIndexHtml(html) {
      const env = Object.fromEntries(
        Object.entries(process.env).filter(([key]) =>
          key.startsWith("MP_WEBSITE_"),
        ),
      );
      return html.replaceAll("__ENV_PLACEHOLDER__", JSON.stringify(env));
    },
  };
}

/**
 * Plugin to transform JSX in TanStack Router's code-split virtual modules.
 * vite-plugin-solid doesn't transform these modules because they have query parameters.
 * This plugin catches any remaining JSX and transforms it using babel-preset-solid.
 */
function codeSplitJsxTransformPlugin(): Plugin {
  return {
    name: "transform-codesplit-jsx",
    async transform(code, id) {
      // Only process code-split modules from TanStack Router
      if (!id.includes("tsr-split")) {
        return null;
      }

      // Check if the code contains JSX by looking for < followed by a letter
      // (JSX tags start with <Letter or <Component)
      if (!/<[A-Z]/i.test(code)) {
        return null;
      }

      const result = await babel.transformAsync(code, {
        filename: id,
        presets: [["babel-preset-solid", { generate: "dom" }]],
        plugins: [["@babel/plugin-syntax-typescript", { isTSX: true }]],
        sourceMaps: true,
        sourceFileName: id,
      });

      if (!result?.code) {
        return null;
      }

      return {
        code: result.code,
        map: result.map,
      };
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

        // oxlint-disable-next-line no-console
        console.warn(message); // Preserve other warnings
      };
    },
  };
}
