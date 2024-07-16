import react from "@vitejs/plugin-react-swc";
import { defineConfig as defineViteConfig } from "vite";
import { checker } from "vite-plugin-checker";

export function defineConfig() {
  return defineViteConfig({
    plugins: [react(), checker({ typescript: true })],
  });
}
