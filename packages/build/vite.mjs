import react from "@vitejs/plugin-react-swc";
import { defineConfig as defineViteConfig } from "vite";
import { checker } from "vite-plugin-checker";
import { defineEnv } from "./defineEnv.mjs";

/**
 * @param {string} projectRoot
 */
export function defineConfig(projectRoot) {
  return defineViteConfig({
    plugins: [react(), checker({ typescript: true })],

    // We use define to opt-out of vite env convention in favor of our own (see @mp/env).
    envPrefix: "_SOMETHING_RIDICULOUS_TO_DISABLE_VITE_ENV_VARS",
    define: defineEnv(projectRoot),
  });
}
