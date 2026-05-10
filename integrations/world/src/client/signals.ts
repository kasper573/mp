import type { EntityId, RiftClient } from "@rift/core";
import type { ReactiveWorld } from "@rift/reactive";
import { computed, type ReadonlySignal } from "@preact/signals-core";
import type { AreaId, CharacterId } from "../identity/ids";
import { CharacterTag } from "../identity/components";
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
  return computed(() => {
    const result: Actor[] = [];
    for (const [id] of moving.value) {
      const actor = readActor(world, id);
      if (actor) result.push(actor);
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
