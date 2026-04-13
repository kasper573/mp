import { preact } from "@preact/preset-vite";
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig(({ command }) => ({
  plugins: [vanillaExtractPlugin(), preact()],
  build: {
    ssr: "src/main.ts",
    outDir: "dist",
    target: "node22",
    sourcemap: true,
    minify: true,
    rollupOptions: {
      output: {
        entryFileNames: "index.js",
      },
    },
  },
  ssr:
    command === "build"
      ? { noExternal: true, external: ["pino", "pino-pretty"] }
      : undefined,
}));
