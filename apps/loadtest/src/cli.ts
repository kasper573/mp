import { hideBin } from "yargs/helpers";
import yargs from "yargs";

export type CliOptions = RemoveIndexSignature<
  ReturnType<typeof readCliOptions>
>;

export const cliEnvPrefix = "MP";

export function readCliOptions(argv = process.argv) {
  const options = yargs(hideBin(argv))
    .env(cliEnvPrefix)
    .parserConfiguration({
      "camel-case-expansion": false, // Ensures only the explicit option names are used
      "unknown-options-as-args": true, // Omits unknown args from the options object
    })
    .option("httpServerUrl", {
      alias: "hs",
      type: "string",
      default: "http://localhost:3002",
      demandOption: true,
    })
    .option("wsServerUrl", {
      alias: "ws",
      type: "string",
      default: "ws://localhost:4000",
      demandOption: true,
    })
    .option("connections", {
      alias: "c",
      type: "number",
      default: 1,
    })
    .option("requests", {
      alias: "r",
      type: "number",
      demandOption: true,
      default: 1,
    })
    .parseSync();

  // Remove some yargs internals
  delete (options as Record<string, unknown>)["$0"];
  delete (options as Record<string, unknown>)["_"];

  return options;
}

type RemoveIndexSignature<T> = {
  [K in keyof T as K extends string
    ? string extends K
      ? never
      : K
    : never]: T[K];
};