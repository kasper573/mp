import { defineConfig } from "@mp/build/tsup";

export default defineConfig({
  entry: { index: "src/main.ts" },
  // Nothing needs the typesecript declaration files of the server app
  dts: false,
});
