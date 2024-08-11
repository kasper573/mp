import { defineConfig } from "@mp/build/tsup.mjs";
import { inferInternalPackages } from "@mp/build/utils.mjs";

export default defineConfig(__dirname, {
  outExtension: () => ({ js: `.js` }),
  format: "esm",
  target: "node20",
  entry: { index: "src/entrypoint.ts" },
  dts: false,
  noExternal: inferInternalPackages(__dirname),
});
