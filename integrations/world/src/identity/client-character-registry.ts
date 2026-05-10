import {
  ClientDisconnected,
  type ClientId,
  type EntityId,
  type World,
} from "@rift/core";
import type { Feature } from "@rift/feature";
import type { UserId, UserIdentity } from "@mp/auth";
import { OwnedByClient } from "./components";

export class ClientUserRegistry {
  readonly #userByClient = new Map<ClientId, UserIdentity>();

  recordConnection(clientId: ClientId, user: UserIdentity): void {
    this.#userByClient.set(clientId, user);
  }

  forgetConnection(clientId: ClientId): void {
    this.#userByClient.delete(clientId);
  }

  getUser(clientId: ClientId): UserIdentity | undefined {
    return this.#userByClient.get(clientId);
  }

  getUserId(clientId: ClientId): UserId | undefined {
    return this.#userByClient.get(clientId)?.id;
  }

  clientIds(): IterableIterator<ClientId> {
    return this.#userByClient.keys();
  }
}

export function clientUserRegistryFeature(
  registry: ClientUserRegistry,
): Feature {
  return {
    server(server) {
      return server.on(ClientDisconnected, ({ data }) => {
        registry.forgetConnection(data.clientId);
      });
    },
  };
}

export function entityForClient(
  world: World,
  clientId: ClientId,
): EntityId | undefined {
  for (const [id, owned] of world.query(OwnedByClient)) {
    if (owned.clientId === clientId) return id;
  }
  return undefined;
}

export function clientForEntity(
  world: World,
  entityId: EntityId,
): ClientId | undefined {
  return world.get(entityId, OwnedByClient)?.clientId;
}
