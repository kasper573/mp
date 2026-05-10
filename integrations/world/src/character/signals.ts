import type { EntityId } from "@rift/core";
import type { ReactiveWorld } from "@rift/reactive";
import { computed, type ReadonlySignal } from "@preact/signals-core";
import type { CharacterId } from "../identity/ids";
import { CharacterTag } from "../identity/components";

export function characterEntitySignal(
  world: ReactiveWorld,
  characterId: ReadonlySignal<CharacterId | undefined>,
): ReadonlySignal<EntityId | undefined> {
  const characters = world.signal.query(CharacterTag);
  return computed(() => {
    const id = characterId.value;
    if (!id) return undefined;
    for (const [entId, tag] of characters.value) {
      if (tag.characterId === id) return entId;
    }
    return undefined;
  });
}
