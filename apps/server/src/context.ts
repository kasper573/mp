import type { World } from "@mp/data";

export interface ServerContext {
  clientId: string;
  world: World;
  time: Date;
}

export interface ClientContext {}

export type ClientState = World;
