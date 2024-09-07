import type { Branded } from "@mp/state";
import type { CharacterId } from "./modules/world/schema";
import type { WorldState } from "./modules/world/schema";

export interface ServerContext {
  source: ServerContextSource;
  world: WorldState;
}

export type ClientId = Branded<string, "ClientId">;

export type ClientState = WorldState;

export type ClientStateUpdate = WorldState;

export class ServerContextSource {
  constructor(public readonly payload: ServerContextSourcePayload) {}

  unwrap<T extends ServerContextSourcePayload["type"]>(
    type: T,
  ): Extract<ServerContextSourcePayload, { type: T }> {
    if (this.payload.type !== type) {
      throw new Error(`Expected source type to be ${type}`);
    }
    return this.payload as never;
  }
}

type ServerContextSourcePayload =
  | Readonly<{ type: "server" }>
  | Readonly<{
      type: "client";
      clientId: ClientId;
      characterId: CharacterId;
    }>;
