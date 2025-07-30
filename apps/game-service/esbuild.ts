import path from "node:path";
import { build } from "@mp/build/esbuild";

void build({
  entryPoints: {
    index: "./src/main.ts",
  },
  outdir: path.resolve(import.meta.dirname, "dist"),
});
