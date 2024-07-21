import type { World } from "@mp/data";

export interface ServerContext {
  clientId: string;
  world: World;
  time: Date;
}

export interface ClientContext {}

/**
 * The subset of world state required by a single client
 */
export type ClientState = World;
