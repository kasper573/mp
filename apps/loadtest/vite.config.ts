import { defineConfig } from "vite";
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";
import { preact } from "@preact/preset-vite";

export default defineConfig({
  esbuild: {
    target: "es2022", // Required for decorators
  },
  plugins: [vanillaExtractPlugin(), preact()],
});
