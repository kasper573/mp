import {
  ClientDisconnected,
  type ClientId,
  type EntityId,
  type World,
} from "@rift/core";
import { combine } from "@mp/std";
import { userRoles } from "@mp/keycloak";
import type { Feature } from "../feature";
import type { UserId } from "@mp/auth";
import { JoinAsPlayer, JoinAsSpectator } from "../character/events";
import { CharacterTag, OwnedByClient } from "./components";
import type {
  UserSession,
  UserSessionCharacterClaim,
  UserSessionIdentity,
} from "./session";

export class SessionRegistry {
  readonly #sessions = new Map<ClientId, UserSession>();

  recordConnection(clientId: ClientId, user: UserSessionIdentity): void {
    this.#sessions.set(clientId, { id: clientId, user });
  }

  forgetConnection(clientId: ClientId): void {
    this.#sessions.delete(clientId);
  }

  setCharacterClaim(
    clientId: ClientId,
    claim: UserSessionCharacterClaim,
  ): void {
    const session = this.#sessions.get(clientId);
    if (!session) return;
    this.#sessions.set(clientId, { ...session, character: claim });
  }

  clearCharacterClaim(clientId: ClientId): void {
    const session = this.#sessions.get(clientId);
    if (!session) return;
    this.#sessions.set(clientId, { ...session, character: undefined });
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

  getCharacterClaim(clientId: ClientId): UserSessionCharacterClaim | undefined {
    return this.#sessions.get(clientId)?.character;
  }
}

export function sessionRegistryFeature(registry: SessionRegistry): Feature {
  return {
    server(server) {
      return combine(
        server.on(ClientDisconnected, ({ data }) => {
          registry.forgetConnection(data.clientId);
        }),
        server.on(JoinAsPlayer, (event) => {
          if (event.source.type !== "wire") return;
          const user = registry.getUser(event.source.clientId);
          if (!user || !user.roles.has(userRoles.join)) return;
          registry.setCharacterClaim(event.source.clientId, {
            type: "player",
            id: event.data,
          });
        }),
        server.on(JoinAsSpectator, (event) => {
          if (event.source.type !== "wire") return;
          const user = registry.getUser(event.source.clientId);
          if (!user || !user.roles.has(userRoles.spectate)) return;
          registry.setCharacterClaim(event.source.clientId, {
            type: "spectator",
            id: event.data,
          });
        }),
      );
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

export function watchedEntityForClient(
  world: World,
  registry: SessionRegistry,
  clientId: ClientId,
): EntityId | undefined {
  const claim = registry.getCharacterClaim(clientId);
  if (!claim) return undefined;
  for (const [id, tag] of world.query(CharacterTag)) {
    if (tag.characterId === claim.id) return id;
  }
  return undefined;
}
