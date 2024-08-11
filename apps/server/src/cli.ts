import path from "path";
import { hideBin } from "yargs/helpers";
import yargs from "yargs";

export type CliArgs = ReturnType<typeof readCliArgs>;
export function readCliArgs() {
  return yargs(hideBin(process.argv))
    .option("clientDistPath", {
      type: "string",
      coerce: fallbackToRelative,
    })
    .option("wsPort", { type: "number", default: 4000 })
    .option("httpPort", { type: "number", default: 2000 })
    .option("httpPublicHostname", { type: "string", default: "localhost" })
    .option("httpListenHostname", { type: "string", default: "0.0.0.0" })
    .option("httpCorsOrigin", { type: "string", default: "*" })
    .option("tickInterval", { type: "number", default: 1000 / 60 })
    .parseSync();
}

function fallbackToRelative(p?: string) {
  if (p !== undefined) {
    return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
  }
}
