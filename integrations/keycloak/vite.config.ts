import { builtinModules } from "node:module";
import { defineConfig } from "vite";

const nodeBuiltins = [
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
];

export default defineConfig({
  ssr: {
    target: "node",
    noExternal: true,
  },
  build: {
    ssr: "scripts/provision.ts",
    outDir: "dist",
    emptyOutDir: true,
    target: "node22",
    sourcemap: true,
    minify: true,
    rolldownOptions: {
      external: nodeBuiltins,
      output: {
        entryFileNames: "provision.js",
        format: "esm",
      },
    },
  },
});
