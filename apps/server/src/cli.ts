import path from "path";
import { hideBin } from "yargs/helpers";
import yargs from "yargs";
import { TimeSpan } from "@mp/time";

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
    .option("clientDir", {
      type: "string",
      description:
        "If provided, serves the client from this directory. Otherwise, assumes the client is served as a separate app.",
      coerce: (p: string) => (p ? path.resolve(p) : undefined),
    })
    .option("publicDir", {
      type: "string",
      default: "public",
      description: "The directory to serve static files from",
      coerce: (p: string) => path.resolve(p),
    })
    .option("publicPath", {
      type: "string",
      default: "/public/",
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
      description: "The public accessable hostname. Used for generating URLs",
    })
    .option("listenHostname", {
      type: "string",
      default: "0.0.0.0",
      description: "The hostname for the server to listen on",
    })
    .option("corsOrigin", {
      type: "string",
      default: "*",
      description: "The CORS origin to allow",
    })
    .option("authSecretKey", {
      type: "string",
      description: "The secret key for the auth server",
    })
    .option("tickInterval", {
      type: "number",
      default: 1000 / 60,
      description: "The server tick interval in milliseconds",
      coerce: (ms: number) => TimeSpan.fromMilliseconds(ms),
    })
    .option("persistInterval", {
      type: "number",
      default: 1000,
      description:
        "How often in milliseconds to save the world state to the database",
      coerce: (ms: number) => TimeSpan.fromMilliseconds(ms),
    })
    .option("databaseUrl", {
      type: "string",
      description: "The URL to the database",
      demandOption: true,
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
