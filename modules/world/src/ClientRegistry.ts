import type { UserId } from "@mp/auth";
import type { ClientId } from "@mp/sync/server";

export class ClientRegistry {
  private map = new Map<ClientId, UserId>();
  private eventHandlers = new Set<ClientRegistryEventHandler>();

  add(clientId: ClientId, userId: UserId) {
    this.map.set(clientId, userId);
    this.emit({ type: "add", userId, clientId });
  }

  remove(clientId: ClientId) {
    const userId = this.map.get(clientId);
    if (userId !== undefined) {
      this.map.delete(clientId);
      this.emit({ type: "remove", userId, clientId });
    }
  }

  getClientIds(): ReadonlySet<ClientId> {
    return new Set(this.map.keys());
  }

  getUserCount(): number {
    return new Set(this.map.values()).size;
  }

  getUserId(clientId: ClientId): UserId | undefined {
    return this.map.get(clientId);
  }

  on(handler: ClientRegistryEventHandler): Unsubscribe {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  private emit(event: ClientRegistryEvent) {
    for (const handler of this.eventHandlers) {
      handler(event);
    }
  }
}

export type Unsubscribe = () => void;

export interface ClientRegistryEvent {
  type: "add" | "remove";
  userId: UserId;
  clientId: ClientId;
}

export type ClientRegistryEventHandler = (
  event: ClientRegistryEvent,
) => unknown;
