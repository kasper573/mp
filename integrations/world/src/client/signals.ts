import type { EntityId, RiftClient } from "@rift/core";
import type { ReactiveWorld } from "@rift/reactive";
import { computed, type ReadonlySignal } from "@preact/signals-core";
import type { CharacterId } from "../identity/ids";
import { CharacterTag } from "../identity/components";
import { InventoryRef } from "../inventory/components";
import type { ItemInstance } from "./views";
import { readItemInstance } from "./views";

export function isConnectedSignal(client: RiftClient): ReadonlySignal<boolean> {
  return computed(() => client.state.value === "open");
}

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

export function inventorySignal(
  world: ReactiveWorld,
  inventoryId: ReadonlySignal<string | undefined>,
): ReadonlySignal<readonly ItemInstance[]> {
  const refs = world.signal.query(InventoryRef);
  return computed(() => {
    const inv = inventoryId.value;
    if (!inv) return [];
    const result: ItemInstance[] = [];
    for (const [id, ref] of refs.value) {
      if (ref.inventoryId !== inv) continue;
      const item = readItemInstance(world, id);
      if (item) result.push(item);
    }
    return result;
  });
}
