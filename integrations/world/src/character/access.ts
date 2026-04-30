import type { World, EntityId } from "@rift/core";
import type { UserId } from "@mp/auth";
import { CharacterTag } from "../identity/components";
import type { CharacterId } from "../identity/ids";

export function findCharacterEntity(
  world: World,
  characterId: CharacterId,
): EntityId | undefined {
  for (const [id, tag] of world.query(CharacterTag)) {
    if (tag.characterId === characterId) {
      return id;
    }
  }
  return undefined;
}

export function characterBelongsToUser(
  world: World,
  characterId: CharacterId,
  userId: UserId,
): boolean {
  for (const [, tag] of world.query(CharacterTag)) {
    if (tag.characterId === characterId && tag.userId === userId) {
      return true;
    }
  }
  return false;
}
