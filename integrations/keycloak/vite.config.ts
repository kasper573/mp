import { defineConfig } from "vite";

export default defineConfig({
  build: {
    ssr: "scripts/provision.ts",
    outDir: "dist",
    target: "node22",
    sourcemap: true,
    minify: true,
    rollupOptions: {
      output: {
        entryFileNames: "provision.js",
      },
    },
  },
  ssr: {
    noExternal: true,
  },
});
