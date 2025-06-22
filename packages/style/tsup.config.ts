import { defineConfig } from "tsup";
import { vanillaExtractPlugin } from "@vanilla-extract/esbuild-plugin";

export default defineConfig((baseOptions) => {
  return {
    entry: { index: "src/index.ts" },
    format: ["esm", "cjs"],
    outDir: "dist",
    sourcemap: true,
    dts: true,
    clean: baseOptions.watch !== true,
    outExtension: ({ format }) =>
      format === "esm" ? { js: ".mjs" } : { js: ".cjs" },
    esbuildPlugins: [vanillaExtractPlugin()],
  };
});
