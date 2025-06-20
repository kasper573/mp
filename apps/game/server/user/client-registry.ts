import type { UserId, UserIdentity } from "@mp/auth";
import { InjectionContext } from "@mp/ioc";
import type { ClientId } from "./client-id";

export const ctxClientRegistry =
  InjectionContext.new<ClientRegistry>("ClientRegistry");

export class ClientRegistry {
  private map = new Map<ClientId, UserIdentity>();
  private eventHandlers = new Set<ClientRegistryEventHandler>();

  add(clientId: ClientId, user: UserIdentity) {
    this.map.set(clientId, user);
    this.emit({ type: "add", user, clientId });
  }

  remove(clientId: ClientId) {
    const user = this.map.get(clientId);
    if (user !== undefined) {
      this.map.delete(clientId);
      this.emit({ type: "remove", user, clientId });
    }
  }

  getClientIds(): ReadonlySet<ClientId> {
    return new Set(this.map.keys());
  }

  getUserCount(): number {
    return new Set(this.map.values()).size;
  }

  getUserId(clientId: ClientId): UserId | undefined {
    return this.map.get(clientId)?.id;
  }

  hasClient(userId: UserId): boolean {
    return this.map.values().some((user) => user.id === userId);
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
  /**
   * This is a temporary solution. We should just store ids, and let user info fetching be a separate concern.
   * @deprecated
   */
  user: UserIdentity;
  clientId: ClientId;
}

export type ClientRegistryEventHandler = (
  event: ClientRegistryEvent,
) => unknown;
