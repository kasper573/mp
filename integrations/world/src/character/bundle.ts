import type { World, EntityId } from "@rift/core";
import type { Vector } from "@mp/math";
import type { Tile, TimesPerSecond } from "@mp/std";
import type { UserId } from "@mp/auth";
import type { ActorModelId, AreaId } from "@mp/fixtures";
import type { CharacterId } from "./id";
import type { InventoryId } from "../inventory/components";
import { CharacterTag } from "../identity/components";
import { AreaTag } from "../area/components";
import { Appearance } from "../appearance/components";
import type { ActorModelLookup } from "../appearance/actor-model";
import { Movement } from "../movement/components";
import { Combat } from "../combat/components";
import { Progression } from "../progression/components";
import { InventoryRef } from "../inventory/components";

export interface SpawnCharacterInit {
  readonly characterId: CharacterId;
  readonly userId: UserId;
  readonly name: string;
  readonly modelId: ActorModelId;
  readonly areaId: AreaId;
  readonly coords: Vector<Tile>;
  readonly inventoryId: InventoryId;
  readonly speed: Tile;
  readonly health: number;
  readonly maxHealth: number;
  readonly attackDamage: number;
  readonly attackSpeed: TimesPerSecond;
  readonly attackRange: Tile;
  readonly xp: number;
  readonly actorModels: ActorModelLookup;
}

export function spawnCharacter(
  world: World,
  init: SpawnCharacterInit,
): EntityId {
  const model = init.actorModels.get(init.modelId);
  if (!model) {
    throw new Error(`No actor model registered for id "${init.modelId}"`);
  }
  const id = world.create();
  world.add(id, CharacterTag, {
    characterId: init.characterId,
    userId: init.userId,
  });
  world.add(id, AreaTag, { areaId: init.areaId });
  world.add(id, Appearance, {
    modelId: init.modelId,
    name: init.name,
    color: undefined,
    opacity: undefined,
  });
  world.add(id, Movement, {
    coords: init.coords,
    speed: init.speed,
    direction: "s",
    moveTarget: undefined,
  });
  world.add(id, Combat, {
    hitBox: model.hitBox,
    health: init.health,
    maxHealth: init.maxHealth,
    alive: init.health > 0,
    attackDamage: init.attackDamage,
    attackSpeed: init.attackSpeed,
    attackRange: init.attackRange,
    attackTargetId: undefined,
    lastAttackMs: undefined,
  });
  world.add(id, Progression, { xp: init.xp });
  world.add(id, InventoryRef, { inventoryId: init.inventoryId });
  return id;
}
