import { object, string } from "@rift/types";
import type { UserId } from "@mp/auth";
import type { CharacterId, NpcDefinitionId, NpcSpawnId } from "./ids";

export const CharacterTag = object({
  characterId: string<CharacterId>(),
  userId: string<UserId>(),
});

export const NpcTag = object({
  definitionId: string<NpcDefinitionId>(),
  spawnId: string<NpcSpawnId>(),
});

export const identityComponents = [CharacterTag, NpcTag] as const;
export const identityEvents = [] as const;
