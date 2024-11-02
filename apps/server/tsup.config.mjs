import { defineConfig } from "@mp/build/tsup.mjs";

export default defineConfig(__dirname, {
  outExtension: () => ({ js: `.js` }),
  format: "cjs",
  target: "node20",
  bundle: true,
  splitting: false,
  entry: { index: "src/main.ts" },
  dts: false,
  noExternal: [/.*/],
});
