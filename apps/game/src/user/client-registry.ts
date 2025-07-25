import type { UserId } from "@mp/auth";
import { InjectionContext } from "@mp/ioc";
import type { CharacterId } from "../character/types";
import type { ClientId } from "./client-id";

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
