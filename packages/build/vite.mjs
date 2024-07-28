import { defineConfig as defineViteConfig } from "vite";
import { checker } from "vite-plugin-checker";

/**
 * @param {string} projectRoot
 */
export function defineConfig(projectRoot) {
  return defineViteConfig({
    plugins: [checker({ typescript: true })],
    envPrefix: "MP_",
  });
}
