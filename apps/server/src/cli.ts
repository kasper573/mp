import path from "path";
import { hideBin } from "yargs/helpers";
import yargs from "yargs";

export type CliArgs = RemoveIndexSignature<ReturnType<typeof readCliArgs>>;

export function readCliArgs() {
  return yargs(hideBin(process.argv))
    .option("clientDistPath", { type: "string", coerce: fallbackToRelative })
    .option("port", { type: "number", default: 4000 })
    .option("hostname", { type: "string", default: "localhost" })
    .option("corsOrigin", { type: "string", default: "*" })
    .option("tickInterval", { type: "number", default: 1000 / 60 })
    .parseSync();
}

function fallbackToRelative(p?: string) {
  if (p !== undefined) {
    return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
  }
}

type RemoveIndexSignature<T> = {
  [K in keyof T as K extends string
    ? string extends K
      ? never
      : K
    : never]: T[K];
};
