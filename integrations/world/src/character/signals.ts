import type { EntityId } from "@rift/core";
import { ReactiveWorld } from "@rift/reactive";
import type { UserId } from "@mp/auth";
import { Appearance } from "../appearance/components";
import { AreaTag } from "../area/components";
import { Combat } from "../combat/components";
import {
  CharacterClaim,
  CharacterList,
  CharacterTag,
  ClientScopeTag,
  NpcTag,
} from "../identity/components";
import { InventoryRef } from "../inventory/components";
import { Movement } from "../movement/components";
import type { CharacterId } from "./id";

export const clientScopeEntity = ReactiveWorld.memo(
  (w): EntityId | undefined => {
    for (const [id] of w.query(ClientScopeTag)) {
      return id;
    }
    return undefined;
  },
);

export const ownedCharacters = ReactiveWorld.memo((w) => {
  const scope = clientScopeEntity(w).value;
  if (scope === undefined) {
    return [];
  }
  return w.get(scope, CharacterList) ?? [];
});

export const characterClaim = ReactiveWorld.memo((w) => {
  const scope = clientScopeEntity(w).value;
  if (scope === undefined) {
    return undefined;
  }
  return w.get(scope, CharacterClaim);
});

export const claimedCharacterEntity = ReactiveWorld.memo(
  (w): EntityId | undefined => {
    const claim = characterClaim(w).value;
    if (!claim) {
      return undefined;
    }
    for (const [id, tag] of w.query(CharacterTag)) {
      if (tag.characterId === claim.characterId) {
        return id;
      }
    }
    return undefined;
  },
);

export const claimedCharacterCombat = ReactiveWorld.memo((w) => {
  const id = claimedCharacterEntity(w).value;
  return id === undefined ? undefined : w.get(id, Combat);
});

export const claimedCharacterMovement = ReactiveWorld.memo((w) => {
  const id = claimedCharacterEntity(w).value;
  return id === undefined ? undefined : w.get(id, Movement);
});

export const claimedCharacterAreaId = ReactiveWorld.memo((w) => {
  const id = claimedCharacterEntity(w).value;
  return id === undefined ? undefined : w.get(id, AreaTag)?.areaId;
});

export const claimedCharacterInventoryId = ReactiveWorld.memo((w) => {
  const id = claimedCharacterEntity(w).value;
  return id === undefined ? undefined : w.get(id, InventoryRef)?.inventoryId;
});

export const claimedCharacterIsDead = ReactiveWorld.memo((w) => {
  const combat = claimedCharacterCombat(w).value;
  return !combat?.alive;
});

export const actors = ReactiveWorld.memo((w) => w.entities(Movement));

export const npcActors = ReactiveWorld.memo((w) =>
  actors(w).value.filter((id) => w.has(id, NpcTag)),
);

export interface LiveCharacter {
  readonly id: CharacterId;
  readonly userId: UserId;
  readonly name: string;
}

export const liveCharacters = ReactiveWorld.memo((w): LiveCharacter[] => {
  const list: LiveCharacter[] = [];
  for (const [, tag, appearance] of w.query(CharacterTag, Appearance)) {
    list.push({
      id: tag.characterId,
      userId: tag.userId,
      name: appearance.name,
    });
  }
  return list;
});
