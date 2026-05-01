import type { EntityId, RiftClient, World } from "@rift/core";
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
  world: World,
  characterId: ReadonlySignal<CharacterId | undefined>,
): ReadonlySignal<EntityId | undefined> {
  return computed(() => {
    const id = characterId.value;
    if (!id) return undefined;
    for (const [entId, tag] of world.query(CharacterTag)) {
      if (tag.characterId === id) return entId;
    }
    return undefined;
  });
}

export function characterSignal(
  world: World,
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
  world: World,
): ReadonlySignal<readonly Actor[]> {
  return computed(() => {
    const result: Actor[] = [];
    for (const [id] of world.query(Movement)) {
      const actor = readActor(world, id);
      if (actor) result.push(actor);
    }
    return result;
  });
}

export function inventorySignal(
  world: World,
  character: ReadonlySignal<Character | undefined>,
): ReadonlySignal<readonly ItemInstance[]> {
  return computed(() => {
    const inventoryId = character.value?.inventoryId;
    if (!inventoryId) return [];
    const result: ItemInstance[] = [];
    for (const [id] of world.query(InventoryRef)) {
      const ref = world.get(id, InventoryRef);
      if (ref?.inventoryId !== inventoryId) continue;
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
