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
    .option("httpServerUrl", {
      type: "string",
      default: `https://${process.env.MP_CLIENT_DOMAIN}`,
      demandOption: true,
    })
    .option("apiServerUrl", {
      type: "string",
      default: process.env.MP_CLIENT_API_URL,
      demandOption: true,
    })
    .option("httpRequests", {
      type: "number",
      default: 1,
    })
    .option("rpcRequests", {
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
