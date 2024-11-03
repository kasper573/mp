import { defineConfig } from "@mp/build/tsup";

export default defineConfig({
  outExtension: () => ({ js: `.js` }),
  format: "cjs",
  target: "node20",
  bundle: true,
  splitting: false,
  entry: { index: "src/main.ts" },
  dts: false,
  noExternal: [/.*/],
});
