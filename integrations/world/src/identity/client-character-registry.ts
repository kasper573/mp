import type { Cleanup } from "@rift/module";
import type { ClientId, EntityId } from "@rift/core";
import { ClientDisconnected, RiftServerModule } from "@rift/core";
import type { UserId, UserIdentity } from "@mp/auth";
import { combine } from "@mp/std";

export class ClientCharacterRegistry extends RiftServerModule {
  readonly #userByClient = new Map<ClientId, UserIdentity>();
  readonly #characterEntityByClient = new Map<ClientId, EntityId>();
  readonly #clientByCharacterEntity = new Map<EntityId, ClientId>();

  init(): Cleanup {
    return combine(
      this.server.on(ClientDisconnected, this.#onDisconnect),
      () => {
        this.#userByClient.clear();
        this.#characterEntityByClient.clear();
        this.#clientByCharacterEntity.clear();
      },
    );
  }

  recordConnection(clientId: ClientId, user: UserIdentity): void {
    this.#userByClient.set(clientId, user);
  }

  getUser(clientId: ClientId): UserIdentity | undefined {
    return this.#userByClient.get(clientId);
  }

  getUserId(clientId: ClientId): UserId | undefined {
    return this.#userByClient.get(clientId)?.id;
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
    return this.#userByClient.keys();
  }

  #onDisconnect = (event: {
    readonly data: { readonly clientId: ClientId };
  }) => {
    const { clientId } = event.data;
    this.#userByClient.delete(clientId);
    this.clearCharacterEntity(clientId);
  };
}
