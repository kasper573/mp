import path from "node:path";
import { build } from "@mp/build/esbuild";

void build({
  entryPoints: {
    provision: "./src/provision.ts",
  },
  outdir: path.resolve(import.meta.dirname, "dist"),
});
