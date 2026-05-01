import { TimeSpan } from "@mp/time";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

export type CliOptions = RemoveIndexSignature<
  ReturnType<typeof readCliOptions>
>;

export const cliEnvPrefix = "MP";

export function readCliOptions(argv = process.argv) {
  const options = yargs(hideBin(argv))
    .env(cliEnvPrefix)
    .parserConfiguration({
      "camel-case-expansion": false,
      "unknown-options-as-args": true,
    })
    .option("verbose", {
      type: "boolean",
      default: false,
    })
    .option("gameServerUrl", {
      type: "string",
      default: process.env.MP_WEBSITE_GAME_SERVER_URL,
      demandOption: true,
    })
    .option("gameClients", {
      alias: "gc",
      type: "number",
      demandOption: true,
      default: 0,
    })
    .options("exitFast", {
      alias: "ef",
      type: "boolean",
      default: false,
    })
    .option("timeout", {
      alias: "t",
      type: "number",
      demandOption: true,
      default: 60_000,
      coerce: (value: number) => TimeSpan.fromMilliseconds(value),
    })
    .parseSync();

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
