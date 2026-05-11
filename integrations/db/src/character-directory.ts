import type { Cleanup, Feature } from "@mp/world";
import {
  CharacterClaim,
  CharacterList,
  CharacterRenamedResponse,
  ClientScopeTag,
  JoinAsPlayer,
  JoinAsSpectator,
  OwnedByClient,
  RenameCharacterRequest,
  scopeEntityForClient,
  type CharacterId,
  type SessionRegistry,
  type UserSessionIdentity,
} from "@mp/world";
import { ClientConnected, ClientDisconnected, type ClientId } from "@rift/core";
import type { ActorModelId, AreaId } from "@mp/fixtures";
import { userRoles } from "@mp/keycloak";
import { combine, type Tile } from "@mp/std";
import type { Vector } from "@mp/math";
import type { DbRepository } from "./repository";

export interface CharacterDirectoryOptions {
  readonly repo: DbRepository;
  readonly registry: SessionRegistry;
  readonly defaultModelId: ActorModelId;
  readonly defaultSpawn: { areaId: AreaId; coords: Vector<Tile> };
}

interface CharacterSummary {
  readonly id: CharacterId;
  readonly name: string;
}

export function characterDirectoryFeature(
  opts: CharacterDirectoryOptions,
): Feature {
  return {
    server(server): Cleanup {
      async function ensureScope(clientId: ClientId): Promise<void> {
        const user = opts.registry.getUser(clientId);
        if (!user) {
          return;
        }
        let scope = scopeEntityForClient(server.world, clientId);
        if (scope === undefined) {
          scope = server.world.create();
          server.world.add(scope, ClientScopeTag, {});
          server.world.add(scope, OwnedByClient, { clientId });
        }
        const characters = await loadCharacters(opts, user);
        server.world.upsert(scope, CharacterList, characters);
      }

      return combine(
        server.on(ClientConnected, ({ data }) => {
          void ensureScope(data.clientId);
        }),

        server.on(ClientDisconnected, ({ data }) => {
          const scope = scopeEntityForClient(server.world, data.clientId);
          if (scope !== undefined) {
            server.world.destroy(scope);
          }
        }),

        server.on(JoinAsPlayer, (event) => {
          if (event.source.type !== "wire") {
            return;
          }
          const clientId = event.source.clientId;
          const user = opts.registry.getUser(clientId);
          if (!user || !user.roles.has(userRoles.join)) {
            return;
          }
          const scope = scopeEntityForClient(server.world, clientId);
          if (scope === undefined) {
            return;
          }
          server.world.upsert(scope, CharacterClaim, {
            mode: "player",
            characterId: event.data,
          });
        }),

        server.on(JoinAsSpectator, (event) => {
          if (event.source.type !== "wire") {
            return;
          }
          const clientId = event.source.clientId;
          const user = opts.registry.getUser(clientId);
          if (!user || !user.roles.has(userRoles.spectate)) {
            return;
          }
          const scope = scopeEntityForClient(server.world, clientId);
          if (scope === undefined) {
            return;
          }
          server.world.upsert(scope, CharacterClaim, {
            mode: "spectator",
            characterId: event.data,
          });
        }),

        server.on(RenameCharacterRequest, async (event) => {
          if (event.source.type !== "wire") {
            return;
          }
          const clientId = event.source.clientId;
          const userId = opts.registry.getUserId(clientId);
          if (!userId) {
            return;
          }
          const access = await opts.repo.mayAccessCharacter({
            userId,
            characterId: event.data.characterId,
          });
          if (access.isErr() || !access.value) {
            return;
          }
          const updated = await opts.repo.updateCharacter({
            characterId: event.data.characterId,
            newName: event.data.name,
          });
          if (updated.isErr()) {
            return;
          }
          server.emit({
            type: CharacterRenamedResponse,
            data: {
              characterId: event.data.characterId,
              name: event.data.name,
            },
            source: { type: "local" },
            target: {
              type: "wire",
              strategy: { type: "list", ids: [clientId] },
            },
          });
        }),
      );
    },
  };
}

async function loadCharacters(
  opts: CharacterDirectoryOptions,
  user: UserSessionIdentity,
): Promise<readonly CharacterSummary[]> {
  const ensureResult = await opts.repo.selectOrCreateCharacterIdForUser({
    user,
    spawnPoint: opts.defaultSpawn,
    defaultModelId: opts.defaultModelId,
  });
  if (ensureResult.isErr()) {
    return [];
  }
  const characterId = ensureResult.value;
  const listResult = await opts.repo.selectCharacterList([characterId]);
  return listResult.isOk()
    ? listResult.value.map((c) => ({ id: c.id, name: c.name }))
    : [];
}
