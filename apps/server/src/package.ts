// This is the file that represents what the @mp/server package exports.
// This module should never export runtime code. Only use type exports.
export type * from "./modules/world/schema";
export type * from "./context";
export type * from "./modules/router";
export type { ServerOptions } from "./schemas/serverOptions";
export { type ClientEnv, clientEnvSchema } from "./schemas/clientEnv";

// An exception is made for the shared code between client & server
export * from "./shared";
