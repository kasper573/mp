// This is the file that represents what the @mp/server package exports.
// This module should never export runtime code. Only use type exports.
export type * from "./modules/world/schema.ts";
export type * from "./context.ts";
export type * from "./modules/router.ts";
export type { ServerOptions } from "./schemas/serverOptions.ts";
export { type ClientEnv, clientEnvSchema } from "./schemas/clientEnv.ts";

// An exception is made for the shared code between client & server
export * from "./shared.ts";
