import { defineConfig } from "vite";
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";
import solid from "vite-plugin-solid";

export default defineConfig({
  esbuild: {
    target: "es2022", // Required for decorators
  },
  plugins: [vanillaExtractPlugin(), solid({ ssr: true })],
});
