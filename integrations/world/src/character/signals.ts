import type { EntityId } from "@rift/core";
import { ReactiveWorld } from "@rift/reactive";
import { computed, type ReadonlySignal } from "@preact/signals-core";
import type { UserId } from "@mp/auth";
import {
  CharacterClaim,
  CharacterList,
  CharacterTag,
  ClientScopeTag,
  type KnownCharacter,
} from "../identity/components";
import { Appearance } from "../appearance/components";
import type { InferValue } from "@rift/types";
import type { CharacterId } from "./id";

export const clientScopeEntity = ReactiveWorld.memo(
  (world): ReadonlySignal<EntityId | undefined> =>
    computed(() => world.signal.query(ClientScopeTag).value[0]?.[0]),
);

export const ownedCharacters = ReactiveWorld.memo(
  (world): ReadonlySignal<readonly InferValue<typeof KnownCharacter>[]> =>
    computed(() => {
      const scope = clientScopeEntity(world).value;
      if (scope === undefined) return [];
      return world.signal.get(scope, CharacterList).value ?? [];
    }),
);

export const characterClaim = ReactiveWorld.memo(
  (world): ReadonlySignal<InferValue<typeof CharacterClaim> | undefined> =>
    computed(() => {
      const scope = clientScopeEntity(world).value;
      if (scope === undefined) return undefined;
      return world.signal.get(scope, CharacterClaim).value;
    }),
);

export const claimedCharacterEntity = ReactiveWorld.memo(
  (world): ReadonlySignal<EntityId | undefined> =>
    computed(() => {
      const claim = characterClaim(world).value;
      if (!claim) return undefined;
      for (const [id, tag] of world.signal.query(CharacterTag).value) {
        if (tag.characterId === claim.characterId) return id;
      }
      return undefined;
    }),
);

export interface LiveCharacter {
  readonly id: CharacterId;
  readonly userId: UserId;
  readonly name: string;
}

export const liveCharacters = ReactiveWorld.memo(
  (world): ReadonlySignal<readonly LiveCharacter[]> =>
    computed(() => {
      const list: LiveCharacter[] = [];
      for (const [, tag, appearance] of world.signal.query(
        CharacterTag,
        Appearance,
      ).value) {
        list.push({
          id: tag.characterId,
          userId: tag.userId,
          name: appearance.name,
        });
      }
      return list;
    }),
);
