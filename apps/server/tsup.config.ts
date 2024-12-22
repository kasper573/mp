import { defineConfig } from "tsup";

export default defineConfig((config) => ({
  format: "esm",
  clean: !config.watch, // Cleaning during watch mode causes race conditions in the toolchain
  dts: false, // Nothing needs the typesecript declaration files of the server app
  minify: !config.watch, // Use watch mode as a hint that we're in development
  sourcemap: true,
  outExtension: ({ format }) => ({
    js: format === "cjs" ? `.cjs` : `.mjs`,
  }),
  target: "node20",
  entry: {
    index: "src/main.ts",
  },
}));
