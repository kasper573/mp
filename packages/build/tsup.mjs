// @ts-check

import { defineConfig as defineTsupConfig } from "tsup";

/**
 * @param {string} projectRoot
 * @param {import("tsup").Options} options
 */
export function defineConfig(projectRoot, options) {
  return defineTsupConfig((config) => ({
    format: ["cjs", "esm"],
    clean: !config.watch, // Cleaning during watch mode causes race conditions in the toolchain
    dts: true,
    minify: !config.watch, // Use watch mode as a hint that we're in development
    sourcemap: true,
    ...options,
  }));
}
