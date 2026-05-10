import { object, string, u32 } from "@rift/types";
import type { ClientId } from "@rift/core";
import type { UserId } from "@mp/auth";
import type { NpcDefinitionId, NpcSpawnId } from "@mp/fixtures";
import type { CharacterId } from "../character/id";

export const CharacterTag = object({
  characterId: string<CharacterId>(),
  userId: string<UserId>(),
});

export const NpcTag = object({
  definitionId: string<NpcDefinitionId>(),
  spawnId: string<NpcSpawnId>(),
});

// Server-only: bound to character entities controlled by a connected client.
// Not in the wire schema; the client doesn't need to know which entity
// belongs to which network connection.
export const OwnedByClient = object({
  clientId: u32<ClientId>(),
});

export const identityComponents = [CharacterTag, NpcTag] as const;
