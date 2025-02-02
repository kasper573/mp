// This is the file that represents what the @mp/server package exports.
// This module should never export runtime code. Only use type exports.
export type * from "./modules/character/schema";
export type * from "./modules/npc/schema";
export type * from "./modules/world/WorldState";
export type * from "./context";
export type * from "./modules/router";
export type * from "./traits/appearance";
export type * from "./traits/movement";
export type { ServerOptions } from "./options";

// An exception is made for the shared code between client & server
export * from "./shared";
