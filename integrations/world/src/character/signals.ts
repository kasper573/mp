import type { EntityId } from "@rift/core";
import { ReactiveWorld } from "@rift/reactive";
import type { UserId } from "@mp/auth";
import {
  CharacterClaim,
  CharacterList,
  CharacterTag,
  ClientScopeTag,
} from "../identity/components";
import { Appearance } from "../appearance/components";
import type { CharacterId } from "./id";

export const clientScopeEntity = ReactiveWorld.memo(
  (s): EntityId | undefined => s.query(ClientScopeTag).value[0]?.[0],
);

export const ownedCharacters = ReactiveWorld.memo((s) => {
  const scope = clientScopeEntity(s).value;
  if (scope === undefined) return [];
  return s.get(scope, CharacterList).value ?? [];
});

export const characterClaim = ReactiveWorld.memo((s) => {
  const scope = clientScopeEntity(s).value;
  if (scope === undefined) return undefined;
  return s.get(scope, CharacterClaim).value;
});

export const claimedCharacterEntity = ReactiveWorld.memo(
  (s): EntityId | undefined => {
    const claim = characterClaim(s).value;
    if (!claim) return undefined;
    for (const [id, tag] of s.query(CharacterTag).value) {
      if (tag.characterId === claim.characterId) return id;
    }
    return undefined;
  },
);

export interface LiveCharacter {
  readonly id: CharacterId;
  readonly userId: UserId;
  readonly name: string;
}

export const liveCharacters = ReactiveWorld.memo((s): LiveCharacter[] => {
  const list: LiveCharacter[] = [];
  for (const [, tag, appearance] of s.query(CharacterTag, Appearance).value) {
    list.push({
      id: tag.characterId,
      userId: tag.userId,
      name: appearance.name,
    });
  }
  return list;
});
