import { createShortId, type Branded } from "@mp/std";
import type { UserId } from "@mp/auth";
import type { CharacterId } from "@mp/game/server";
import { InjectionContext } from "@mp/ioc";

export const ctxClientRegistry =
  InjectionContext.new<ClientRegistry>("ClientRegistry");

/**
 * Stores meta data about connected clients in memory
 */
export class ClientRegistry {
  readonly userIds = new Map<ClientId, UserId>();
  readonly characterIds = new Map<ClientId, CharacterId>();
  readonly spectatedCharacterIds = new Map<ClientId, CharacterId>();

  clearAll() {
    this.userIds.clear();
    this.characterIds.clear();
    this.spectatedCharacterIds.clear();
  }

  removeClient(clientId: ClientId) {
    this.userIds.delete(clientId);
    this.characterIds.delete(clientId);
    this.spectatedCharacterIds.delete(clientId);
  }

  getClientIds(): ReadonlySet<ClientId> {
    return new Set([...this.userIds.keys(), ...this.characterIds.keys()]);
  }

  getUserCount(): number {
    return new Set(this.userIds.values()).size;
  }
}

export type ClientId = Branded<string, "ClientId">;

export function getClientId(socket: WebSocket): ClientId {
  let id = Reflect.get(socket, idSymbol) as ClientId | undefined;
  if (id === undefined) {
    id = createShortId() as ClientId;
    Reflect.set(socket, idSymbol, id);
  }
  return id;
}

const idSymbol = Symbol("socketId");

export const ctxClientId = InjectionContext.new<ClientId>("ClientId");
