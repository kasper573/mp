import { defineConfig as defineViteConfig } from "vite";
import { checker } from "vite-plugin-checker";
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";
import solid from "vite-plugin-solid";

/**
 * @param {string} projectRoot
 */
export function defineConfig(projectRoot) {
  return defineViteConfig({
    plugins: [vanillaExtractPlugin(), solid(), checker({ typescript: true })],
    envPrefix: "MP_",
  });
}
