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
    .option("verbose", {
      type: "boolean",
      default: false,
    })
    .option("wsUrl", {
      type: "string",
      default: process.env.MP_CLIENT_WS_URL,
      demandOption: true,
    })
    .option("httpServerUrl", {
      type: "string",
      default: `https://${process.env.MP_CLIENT_DOMAIN}`,
      demandOption: true,
    })
    .option("httpRequests", {
      alias: "http",
      type: "number",
      default: 1,
    })
    .option("gameClients", {
      alias: "gc",
      type: "number",
      demandOption: true,
      default: 0,
    })
    .option("timeout", {
      alias: "t",
      type: "number",
      demandOption: true,
      default: 60_000,
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
