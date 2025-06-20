import type { AuthToken, UserId } from "@mp/auth";
import { InjectionContext } from "@mp/ioc";
import type { ClientId } from "./client-id";

export const ctxClientRegistry =
  InjectionContext.new<ClientRegistry>("ClientRegistry");

export class ClientRegistry {
  private map = new Map<ClientId, ClientRegistryUser>();
  private eventHandlers = new Set<ClientRegistryEventHandler>();

  set(clientId: ClientId, user: ClientRegistryUser) {
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
    return this.map.get(clientId)?.userId;
  }

  getAuthToken(clientId: ClientId): AuthToken | undefined {
    return this.map.get(clientId)?.authToken;
  }

  hasClient(userId: UserId): boolean {
    return this.map.values().some((u) => u.userId === userId);
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

export interface ClientRegistryUser {
  /**
   * THe user id that the client is associated with
   */
  userId: UserId;
  /**
   * The most recent auth token the user has provided
   */
  authToken: AuthToken;
}

export type Unsubscribe = () => void;

export interface ClientRegistryEvent {
  type: "add" | "remove";
  user: ClientRegistryUser;
  clientId: ClientId;
}

export type ClientRegistryEventHandler = (
  event: ClientRegistryEvent,
) => unknown;
