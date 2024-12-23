import path from "node:path";
import { defineConfig } from "vite";
import builtinModules from "builtin-modules";

export default defineConfig({
  build: {
    target: "node22",
    sourcemap: true,
    lib: {
      entry: path.resolve(__dirname, "src/main.ts"),
      name: "mp-server",
      fileName: "index",
      formats: ["es"],
    },
    rollupOptions: {
      external: [...builtinModules, /node:.*/],
    },
  },
  publicDir: false,
});
