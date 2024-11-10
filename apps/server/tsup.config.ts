import { defineConfig } from "@mp/build/tsup";

export default defineConfig({
  format: "esm",
  target: "node20",
  entry: {
    index: "src/main.ts",
    package: "src/package.ts",
  },
  // Nothing needs the typesecript declaration files of the server app
  dts: false,
});
