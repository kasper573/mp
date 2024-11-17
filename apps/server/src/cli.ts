import path from "node:path";
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
      description: "Serves the client from this directory",
      coerce: (p: string) => (p ? path.resolve(p) : undefined),
      demandOption: true,
    })
    .option("publicDir", {
      type: "string",
      demandOption: true,
      description: "The directory to serve static files from",
      coerce: (p: string) => path.resolve(p),
    })
    .option("publicPath", {
      type: "string",
      demandOption: true,
      description:
        "The relative path after the hostname where the public dir will be exposed",
    })
    .option("publicMaxAge", {
      type: "number",
      demandOption: true,
      description:
        "The max age of files served from the public directory in seconds",
    })
    .option("trustProxy", {
      type: "boolean",
      description: "Should the http servevr trust the X-Forwarded-For header",
      demandOption: true,
    })
    .option("port", {
      type: "number",
      description: "The port to listen on",
      demandOption: true,
    })
    .option("httpBaseUrl", {
      type: "string",
      description:
        "Used for generating public accessible urls to the http server",
      demandOption: true,
    })
    .option("wsBaseUrl", {
      type: "string",
      description:
        "Used for generating public accessible urls to the websocket server",
      demandOption: true,
    })
    .option("hostname", {
      type: "string",
      description: "The hostname for the server to listen on",
      demandOption: true,
    })
    .option("corsOrigin", {
      type: "string",
      description: "The CORS origin to allow",
      demandOption: true,
    })
    .option("authSecretKey", {
      type: "string",
      description: "The secret key for the auth server",
      demandOption: true,
    })
    .option("authPublishableKey", {
      type: "string",
      description: "The publishable key for the auth server",
      demandOption: true,
    })
    .option("tickInterval", {
      type: "number",
      description: "The server tick interval in milliseconds",
      coerce: (ms: number) => TimeSpan.fromMilliseconds(ms),
      demandOption: true,
    })
    .option("persistInterval", {
      type: "number",
      description:
        "How often (in milliseconds) to save the world state to the database",
      coerce: (ms: number) => TimeSpan.fromMilliseconds(ms),
      demandOption: true,
    })
    .option("logSyncPatches", {
      type: "boolean",
      description:
        "Whether to log server state changes that are sent to clients",
      demandOption: true,
    })
    .option("databaseUrl", {
      type: "string",
      description: "The URL to the database",
      demandOption: true,
    })
    .option("buildVersion", {
      type: "string",
      description: "The version of the build",
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
