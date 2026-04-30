import type { Cleanup } from "@rift/module";
import type { ClientId, EntityId } from "@rift/core";
import { ClientDisconnected, RiftServerModule } from "@rift/core";
import type { UserId } from "@mp/auth";

export class ClientCharacterRegistry extends RiftServerModule {
  readonly #userIdByClient = new Map<ClientId, UserId>();
  readonly #characterEntityByClient = new Map<ClientId, EntityId>();
  readonly #clientByCharacterEntity = new Map<EntityId, ClientId>();

  init(): Cleanup {
    const offDisconnect = this.server.on(
      ClientDisconnected,
      this.#onDisconnect,
    );
    return () => {
      offDisconnect();
      this.#userIdByClient.clear();
      this.#characterEntityByClient.clear();
      this.#clientByCharacterEntity.clear();
    };
  }

  recordConnection(clientId: ClientId, userId: UserId): void {
    this.#userIdByClient.set(clientId, userId);
  }

  getUserId(clientId: ClientId): UserId | undefined {
    return this.#userIdByClient.get(clientId);
  }

  getCharacterEntity(clientId: ClientId): EntityId | undefined {
    return this.#characterEntityByClient.get(clientId);
  }

  getClientId(entityId: EntityId): ClientId | undefined {
    return this.#clientByCharacterEntity.get(entityId);
  }

  setCharacterEntity(clientId: ClientId, entityId: EntityId): void {
    const existing = this.#characterEntityByClient.get(clientId);
    if (existing !== undefined) {
      this.#clientByCharacterEntity.delete(existing);
    }
    this.#characterEntityByClient.set(clientId, entityId);
    this.#clientByCharacterEntity.set(entityId, clientId);
  }

  clearCharacterEntity(clientId: ClientId): void {
    const existing = this.#characterEntityByClient.get(clientId);
    if (existing !== undefined) {
      this.#clientByCharacterEntity.delete(existing);
      this.#characterEntityByClient.delete(clientId);
    }
  }

  clientIds(): IterableIterator<ClientId> {
    return this.#userIdByClient.keys();
  }

  #onDisconnect = (event: {
    readonly data: { readonly clientId: ClientId };
  }) => {
    const { clientId } = event.data;
    this.#userIdByClient.delete(clientId);
    this.clearCharacterEntity(clientId);
  };
}
