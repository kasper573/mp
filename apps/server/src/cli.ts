import path from "path";
import { hideBin } from "yargs/helpers";
import yargs from "yargs";

export type CliArgs = RemoveIndexSignature<ReturnType<typeof readCliArgs>>;

export function readCliArgs() {
  const res = yargs(hideBin(process.argv))
    .parserConfiguration({
      "camel-case-expansion": false, // Ensures only the explicit option names are used
      "unknown-options-as-args": true, // Omits unknown args from the options object
    })
    .option("clientDir", {
      type: "string",
      description:
        "If provided, serves the client from this directory. Otherwise, assumes the client is served as a separate app.",
      coerce: (p) => (p ? path.resolve(p) : undefined),
    })
    .option("publicDir", {
      type: "string",
      default: "public",
      description: "The directory to serve static files from",
      coerce: path.resolve,
    })
    .option("publicPath", {
      type: "string",
      default: "public",
      description:
        "The relative path after the hostname where the public dir will be exposed",
    })
    .option("port", {
      type: "number",
      default: 4000,
      description: "The port to listen on",
    })
    .option("hostname", {
      type: "string",
      default: "localhost:4000",
      description: "The public hostname. Used for generating URLs",
    })
    .option("corsOrigin", {
      type: "string",
      default: "*",
      description: "The CORS origin to allow",
    })
    .option("tickInterval", {
      type: "number",
      default: 1000 / 60,
      description: "The server tick interval in milliseconds",
    })
    .parseSync();

  // Remove some yargs internals
  delete (res as Record<string, unknown>)["$0"];
  delete (res as Record<string, unknown>)["_"];

  return res;
}

type RemoveIndexSignature<T> = {
  [K in keyof T as K extends string
    ? string extends K
      ? never
      : K
    : never]: T[K];
};
