import { defineConfig as defineViteConfig } from "vite";
import { checker } from "vite-plugin-checker";
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";
import solid from "vite-plugin-solid";
import wasm from "vite-plugin-wasm";

/**
 * @param {string} projectRoot
 */
export function defineConfig(projectRoot) {
  return defineViteConfig({
    plugins: [
      vanillaExtractPlugin(),
      solid(),
      wasm(),
      checker({ typescript: true }),
    ],
    envPrefix: "MP_",
  });
}
