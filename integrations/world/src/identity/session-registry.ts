import {
  ClientDisconnected,
  type ClientId,
  type EntityId,
  type LocalWorldEvent,
  type World,
} from "@rift/core";
import type { Feature } from "../feature";
import type { UserId } from "@mp/auth";
import {
  CharacterClaim,
  CharacterTag,
  ClientScopeTag,
  OwnedByClient,
} from "./components";
import type { CharacterId } from "../character/id";
import type { UserSession, UserSessionIdentity } from "./session";

export class SessionRegistry {
  readonly #sessions = new Map<ClientId, UserSession>();
  readonly #characterByClient = new Map<ClientId, EntityId>();
  readonly #scopeByClient = new Map<ClientId, EntityId>();
  readonly #characterByCharacterId = new Map<CharacterId, EntityId>();
  readonly #claimByScope = new Map<EntityId, CharacterId>();

  recordConnection(clientId: ClientId, user: UserSessionIdentity): void {
    this.#sessions.set(clientId, { id: clientId, user });
  }

  forgetConnection(clientId: ClientId): void {
    this.#sessions.delete(clientId);
  }

  getSession(clientId: ClientId): UserSession | undefined {
    return this.#sessions.get(clientId);
  }

  getUser(clientId: ClientId): UserSessionIdentity | undefined {
    return this.#sessions.get(clientId)?.user;
  }

  getUserId(clientId: ClientId): UserId | undefined {
    return this.#sessions.get(clientId)?.user?.id;
  }

  getCharacterEntity(clientId: ClientId): EntityId | undefined {
    return this.#characterByClient.get(clientId);
  }

  getScopeEntity(clientId: ClientId): EntityId | undefined {
    return this.#scopeByClient.get(clientId);
  }

  getWatchedEntity(clientId: ClientId): EntityId | undefined {
    const scope = this.#scopeByClient.get(clientId);
    if (scope === undefined) {
      return undefined;
    }
    const characterId = this.#claimByScope.get(scope);
    if (characterId === undefined) {
      return undefined;
    }
    return this.#characterByCharacterId.get(characterId);
  }

  attachWorld(world: World): () => void {
    for (const [id, owned] of world.query(OwnedByClient, CharacterTag)) {
      this.#characterByClient.set(owned.clientId, id);
    }
    for (const [id, owned] of world.query(OwnedByClient, ClientScopeTag)) {
      this.#scopeByClient.set(owned.clientId, id);
    }
    for (const [id, tag] of world.query(CharacterTag)) {
      this.#characterByCharacterId.set(tag.characterId, id);
    }
    for (const [id, claim] of world.query(CharacterClaim)) {
      this.#claimByScope.set(id, claim.characterId);
    }
    return world.on((event) => this.#handleWorldEvent(world, event));
  }

  #handleWorldEvent(world: World, event: LocalWorldEvent): void {
    if (event.type === "entityCreated") {
      return;
    }
    if (event.type === "entityDestroyed") {
      this.#dropEntity(event.id);
      return;
    }
    if (
      event.component !== OwnedByClient &&
      event.component !== CharacterTag &&
      event.component !== ClientScopeTag &&
      event.component !== CharacterClaim
    ) {
      return;
    }
    if (event.type === "componentRemoved") {
      this.#dropFromIndexes(world, event.id, event.component);
      return;
    }
    this.#refreshEntity(world, event.id, event.component);
  }

  #refreshEntity(world: World, id: EntityId, component: unknown): void {
    if (component === OwnedByClient || component === CharacterTag) {
      this.#refreshCharacterIndex(world, id);
    }
    if (component === OwnedByClient || component === ClientScopeTag) {
      this.#refreshScopeIndex(world, id);
    }
    if (component === CharacterTag) {
      const tag = world.get(id, CharacterTag);
      if (tag) {
        this.#characterByCharacterId.set(tag.characterId, id);
      }
    }
    if (component === CharacterClaim) {
      const claim = world.get(id, CharacterClaim);
      if (claim) {
        this.#claimByScope.set(id, claim.characterId);
      }
    }
  }

  #refreshCharacterIndex(world: World, id: EntityId): void {
    const owned = world.get(id, OwnedByClient);
    const tag = world.get(id, CharacterTag);
    if (owned && tag) {
      this.#characterByClient.set(owned.clientId, id);
    } else {
      this.#dropCharacterMapping(id);
    }
  }

  #refreshScopeIndex(world: World, id: EntityId): void {
    const owned = world.get(id, OwnedByClient);
    const scope = world.get(id, ClientScopeTag);
    if (owned && scope) {
      this.#scopeByClient.set(owned.clientId, id);
    } else {
      this.#dropScopeMapping(id);
    }
  }

  #dropFromIndexes(world: World, id: EntityId, component: unknown): void {
    if (component === OwnedByClient || component === CharacterTag) {
      this.#dropCharacterMapping(id);
    }
    if (component === OwnedByClient || component === ClientScopeTag) {
      this.#dropScopeMapping(id);
    }
    if (component === CharacterTag) {
      this.#dropCharacterByCharacterId(world, id);
    }
    if (component === CharacterClaim) {
      this.#claimByScope.delete(id);
    }
  }

  #dropEntity(id: EntityId): void {
    this.#dropCharacterMapping(id);
    this.#dropScopeMapping(id);
    for (const [characterId, entId] of this.#characterByCharacterId) {
      if (entId === id) {
        this.#characterByCharacterId.delete(characterId);
        break;
      }
    }
    this.#claimByScope.delete(id);
  }

  #dropCharacterMapping(id: EntityId): void {
    for (const [clientId, entId] of this.#characterByClient) {
      if (entId === id) {
        this.#characterByClient.delete(clientId);
        break;
      }
    }
  }

  #dropScopeMapping(id: EntityId): void {
    for (const [clientId, entId] of this.#scopeByClient) {
      if (entId === id) {
        this.#scopeByClient.delete(clientId);
        break;
      }
    }
  }

  #dropCharacterByCharacterId(world: World, id: EntityId): void {
    // Component was removed before we could read its characterId — walk the
    // index to find the corresponding entry.
    for (const [characterId, entId] of this.#characterByCharacterId) {
      if (entId === id) {
        this.#characterByCharacterId.delete(characterId);
        return;
      }
    }
    void world;
  }
}

export function sessionRegistryFeature(registry: SessionRegistry): Feature {
  return {
    server(server) {
      const detach = registry.attachWorld(server.world);
      const off = server.on(ClientDisconnected, ({ data }) => {
        registry.forgetConnection(data.clientId);
      });
      return () => {
        detach();
        return off();
      };
    },
  };
}

export function entityForClient(
  registry: SessionRegistry,
  clientId: ClientId,
): EntityId | undefined {
  return registry.getCharacterEntity(clientId);
}

export function scopeEntityForClient(
  registry: SessionRegistry,
  clientId: ClientId,
): EntityId | undefined {
  return registry.getScopeEntity(clientId);
}

export function watchedEntityForClient(
  registry: SessionRegistry,
  clientId: ClientId,
): EntityId | undefined {
  return registry.getWatchedEntity(clientId);
}
