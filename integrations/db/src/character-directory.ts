import type { Cleanup, Feature } from "@mp/world";
import {
  Appearance,
  CharacterListResponse,
  CharacterRenamedResponse,
  CharacterTag,
  ListCharactersRequest,
  RenameCharacterRequest,
  type CharacterId,
  type SessionRegistry,
} from "@mp/world";
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
      return combine(
        server.on(ListCharactersRequest, async (event) => {
          if (event.source.type !== "wire") return;
          const clientId = event.source.clientId;
          const user = opts.registry.getUser(clientId);
          if (!user) return;

          let characters: CharacterSummary[];
          if (user.roles.has(userRoles.spectate)) {
            characters = [];
            for (const [, tag, appearance] of server.world.query(
              CharacterTag,
              Appearance,
            )) {
              if (tag.userId === user.id) continue;
              characters.push({ id: tag.characterId, name: appearance.name });
            }
          } else {
            const ensureResult =
              await opts.repo.selectOrCreateCharacterIdForUser({
                user,
                spawnPoint: opts.defaultSpawn,
                defaultModelId: opts.defaultModelId,
              });
            if (ensureResult.isErr()) return;
            const characterId = ensureResult.value;
            const listResult = await opts.repo.selectCharacterList([
              characterId,
            ]);
            characters = listResult.isOk()
              ? listResult.value.map((c) => ({ id: c.id, name: c.name }))
              : [];
          }

          server.emit({
            type: CharacterListResponse,
            data: characters,
            source: { type: "local" },
            target: {
              type: "wire",
              strategy: { type: "list", ids: [clientId] },
            },
          });
        }),

        server.on(RenameCharacterRequest, async (event) => {
          if (event.source.type !== "wire") return;
          const clientId = event.source.clientId;
          const userId = opts.registry.getUserId(clientId);
          if (!userId) return;
          const access = await opts.repo.mayAccessCharacter({
            userId,
            characterId: event.data.characterId,
          });
          if (access.isErr() || !access.value) return;
          const updated = await opts.repo.updateCharacter({
            characterId: event.data.characterId,
            newName: event.data.name,
          });
          if (updated.isErr()) return;
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
