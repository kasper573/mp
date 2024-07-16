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
    envPrefix: "MP_",
    define: defineEnv(projectRoot),
  });
}
