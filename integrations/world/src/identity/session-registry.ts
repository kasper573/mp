import {
  ClientDisconnected,
  type ClientId,
  type EntityId,
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
import type { UserSession, UserSessionIdentity } from "./session";

export class SessionRegistry {
  readonly #sessions = new Map<ClientId, UserSession>();

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
}

export function sessionRegistryFeature(registry: SessionRegistry): Feature {
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
  for (const [id, owned, _tag] of world.query(OwnedByClient, CharacterTag)) {
    if (owned.clientId === clientId) {
      return id;
    }
  }
  return undefined;
}

export function scopeEntityForClient(
  world: World,
  clientId: ClientId,
): EntityId | undefined {
  for (const [id, owned, _tag] of world.query(OwnedByClient, ClientScopeTag)) {
    if (owned.clientId === clientId) {
      return id;
    }
  }
  return undefined;
}

export function watchedEntityForClient(
  world: World,
  clientId: ClientId,
): EntityId | undefined {
  const scope = scopeEntityForClient(world, clientId);
  if (scope === undefined) {
    return undefined;
  }
  const claim = world.get(scope, CharacterClaim);
  if (!claim) {
    return undefined;
  }
  for (const [id, tag] of world.query(CharacterTag)) {
    if (tag.characterId === claim.characterId) {
      return id;
    }
  }
  return undefined;
}
