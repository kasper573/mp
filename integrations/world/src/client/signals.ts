import type { EntityId, RiftClient } from "@rift/core";
import type { ReactiveWorld } from "@rift/reactive";
import { computed, type ReadonlySignal } from "@preact/signals-core";
import type { AreaId, CharacterId } from "../identity/ids";
import { CharacterTag, NpcTag } from "../identity/components";
import { Movement } from "../movement/components";
import { InventoryRef } from "../inventory/components";
import type { Actor, Character, ItemInstance } from "./views";
import { readActor, readItemInstance } from "./views";

export function isConnectedSignal(client: RiftClient): ReadonlySignal<boolean> {
  return computed(() => client.state.value === "open");
}

export function characterEntitySignal(
  world: ReactiveWorld,
  characterId: ReadonlySignal<CharacterId | undefined>,
): ReadonlySignal<EntityId | undefined> {
  const characters = world.entitiesSignal(CharacterTag);
  return computed(() => {
    const id = characterId.value;
    if (!id) return undefined;
    for (const [entId, tag] of characters.value) {
      if (tag.characterId === id) return entId;
    }
    return undefined;
  });
}

export function characterSignal(
  world: ReactiveWorld,
  characterId: ReadonlySignal<CharacterId | undefined>,
): ReadonlySignal<Character | undefined> {
  const entitySignal = characterEntitySignal(world, characterId);
  return computed(() => {
    const entId = entitySignal.value;
    if (entId === undefined) return undefined;
    const actor = readActor(world, entId);
    return actor?.type === "character" ? actor : undefined;
  });
}

export function actorListSignal(
  world: ReactiveWorld,
): ReadonlySignal<readonly Actor[]> {
  const moving = world.entitiesSignal(Movement);
  // Cache stable Actor instances by entityId so consumers using reference
  // identity (e.g. reactiveCollectionBinding) don't churn on every tick.
  const cache = new Map<EntityId, Actor>();
  return computed(() => {
    void moving.value;
    world.trackPool(CharacterTag);
    world.trackPool(NpcTag);
    const result: Actor[] = [];
    const seen = new Set<EntityId>();
    for (const [id] of moving.value) {
      seen.add(id);
      let actor = cache.get(id);
      if (!actor) {
        const created = readActor(world, id);
        if (!created) continue;
        actor = created;
        cache.set(id, actor);
      }
      result.push(actor);
    }
    for (const id of cache.keys()) {
      if (!seen.has(id)) cache.delete(id);
    }
    return result;
  });
}

export function inventorySignal(
  world: ReactiveWorld,
  character: ReadonlySignal<Character | undefined>,
): ReadonlySignal<readonly ItemInstance[]> {
  const refs = world.entitiesSignal(InventoryRef);
  return computed(() => {
    const inventoryId = character.value?.inventoryId;
    if (!inventoryId) return [];
    const result: ItemInstance[] = [];
    for (const [id, ref] of refs.value) {
      if (ref.inventoryId !== inventoryId) continue;
      const item = readItemInstance(world, id);
      if (item) result.push(item);
    }
    return result;
  });
}

export function areaIdSignal(
  character: ReadonlySignal<Character | undefined>,
): ReadonlySignal<AreaId | undefined> {
  return computed(() => character.value?.areaId);
}

export function isGameReadySignal(
  character: ReadonlySignal<Character | undefined>,
): ReadonlySignal<boolean> {
  return computed(() => !!character.value?.areaId);
}
