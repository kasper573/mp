import { defineConfig } from "@mp/build/tsup.mjs";

export default defineConfig(__dirname, {
  outExtension: () => ({ js: `.js` }),
  format: "cjs",
  target: "node20",
  bundle: true,
  splitting: false,
  minify: true,
  entry: { index: "src/main.ts" },
  dts: false,
  noExternal: [/.*/],
});
