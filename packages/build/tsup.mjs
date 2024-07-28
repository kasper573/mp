// @ts-check

import { defineConfig as defineTsupConfig } from "tsup";

/**
 * @param {string} projectRoot
 * @param {import("tsup").Options} options
 */
export function defineConfig(projectRoot, options) {
  return defineTsupConfig({
    format: ["cjs", "esm"],
    clean: true,
    dts: true,
    ...options,
  });
}
