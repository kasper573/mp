import type { Options } from "tsup";
import { defineConfig as defineTsupConfig } from "tsup";
import { solidPlugin } from "esbuild-plugin-solid";

export function defineConfig(options: Options) {
  return defineTsupConfig((config) => ({
    format: ["cjs", "esm"],
    clean: !config.watch, // Cleaning during watch mode causes race conditions in the toolchain
    dts: true,
    minify: !config.watch, // Use watch mode as a hint that we're in development
    sourcemap: true,
    outExtension: ({ format }) => ({
      js: format === "cjs" ? `.cjs` : `.mjs`,
    }),
    esbuildPlugins: [solidPlugin()],
    ...options,
  }));
}
