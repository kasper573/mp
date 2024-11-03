import { defineConfig, solidPlugin } from "@mp/build/tsup";

export default defineConfig({
  entry: { index: "src/index.ts" },
  plugins: [solidPlugin()],
});
