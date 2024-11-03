import { defineConfig } from "./src/tsup";

export default defineConfig({
  entry: {
    tsup: "src/tsup.ts",
    utils: "src/utils.ts",
    vite: "src/vite.ts",
  },
  bundle: false,
});
