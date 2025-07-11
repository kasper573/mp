import { defineConfig } from "vite";
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";
import react from "@vitejs/plugin-react";

export default defineConfig({
  esbuild: {
    target: "es2022", // Required for decorators
  },
  plugins: [vanillaExtractPlugin(), react()],
});
