import path from "path";
import { hideBin } from "yargs/helpers";
import yargs from "yargs";

export type CliArgs = RemoveIndexSignature<ReturnType<typeof readCliArgs>>;

export function readCliArgs() {
  return yargs(hideBin(process.argv))
    .option("clientDir", {
      type: "string",
      coerce: (p) => (p ? path.resolve(p) : undefined),
    })
    .option("publicDir", {
      type: "string",
      default: "public",
      coerce: path.resolve,
    })
    .option("publicPath", { type: "string", default: "/public/" })
    .option("port", { type: "number", default: 4000 })
    .option("hostname", { type: "string", default: "localhost:4000" })
    .option("corsOrigin", { type: "string", default: "*" })
    .option("tickInterval", { type: "number", default: 1000 / 60 })
    .parseSync();
}

type RemoveIndexSignature<T> = {
  [K in keyof T as K extends string
    ? string extends K
      ? never
      : K
    : never]: T[K];
};
