import path from "node:path";
import { build } from "@mp/build/rolldown";

await build({
  entryPoints: {
    provision: "./scripts/provision.ts",
  },
  outdir: path.resolve(import.meta.dirname, "dist"),
});
