// This is the file that represents what the @mp/server package exports.
// This module should never export runtime code. Only use type exports.
export type * from "./modules/character/schema.ts";
export type * from "./modules/npc/schema.ts";
export type * from "./modules/world/WorldState.ts";
export type * from "./context.ts";
export type * from "./modules/router.ts";
export type * from "./traits/appearance.ts";
export type * from "./traits/movement.ts";
export type { ServerOptions } from "./options.ts";

// An exception is made for the shared code between client & server
export * from "./shared.ts";
