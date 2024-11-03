import { defineConfig } from "@mp/build/tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    ["themes/dark"]: "src/themes/dark.css.ts",
  },
});
