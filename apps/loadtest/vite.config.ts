import { defineConfig } from "vite";
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";
import solid from "vite-plugin-solid";

export default defineConfig({
  plugins: [vanillaExtractPlugin(), solid({ ssr: true })],
});
