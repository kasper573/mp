import { build } from "@mp/build/esbuild";
import path from "node:path";

void build({
  entryPoints: {
    provision: "./scripts/provision.ts",
  },
  outdir: path.resolve(import.meta.dirname, "dist"),
});
