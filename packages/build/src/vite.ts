import type { Plugin, UserConfig } from "vite";
import { defineConfig as defineViteConfig } from "vite";
import { checker } from "vite-plugin-checker";
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";
import solid from "vite-plugin-solid";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
// @ts-expect-error We don't have any types for this
import handlebarsPlugin from "vite-plugin-handlebars";

export function defineConfig({
  plugins = [],
}: Pick<UserConfig, "plugins"> = {}): UserConfig {
  return defineViteConfig({
    plugins: [
      vanillaExtractPlugin(),
      solid(),
      wasm(),
      topLevelAwait(),
      checker({ typescript: true }),
      ...plugins,
    ],
    envPrefix: "MP_",
  });
}

export function handlebars(options: {
  context: Record<string, unknown>;
}): Plugin {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  return handlebarsPlugin(options) as Plugin;
}
