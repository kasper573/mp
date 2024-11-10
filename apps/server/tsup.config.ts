import { defineConfig } from "@mp/build/tsup";

export default defineConfig({
  format: "esm",
  target: "node20",
  entry: {
    index: "src/main.ts",
    package: "src/package.ts",
  },
});
