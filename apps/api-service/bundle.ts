import path from "node:path";
import { build } from "@mp/build/rolldown";

await build({
  entryPoints: {
    index: "./server/main.ts",
  },
  outdir: path.resolve(import.meta.dirname, "dist"),
  suppressedWarnings: ["EVAL"], // @protobufjs/inquire uses indirect eval intentionally
});
