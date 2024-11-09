import { defineConfig as defineViteConfig } from "vite";
import { checker } from "vite-plugin-checker";
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";
import solid from "vite-plugin-solid";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";

export function defineConfig() {
  return defineViteConfig({
    plugins: [
      vanillaExtractPlugin(),
      solid(),
      wasm(),
      topLevelAwait(),
      checker({ typescript: true }),
    ],
    envPrefix: "MP_",
  });
}
