import type { World, EntityId } from "@rift/core";
import type { Vector } from "@mp/math";
import type { Tile } from "@mp/std";
import { AreaTag } from "../area/components";
import { Appearance } from "../appearance/components";
import type { ActorModelLookup } from "../appearance/actor-model";
import { Movement } from "../movement/components";
import { Combat } from "../combat/components";
import { NpcTag } from "../identity/components";
import { NpcAi } from "./components";
import type { NpcDefinition, NpcSpawn, NpcType } from "./definitions";

export interface SpawnNpcInit {
  readonly definition: NpcDefinition;
  readonly spawn: NpcSpawn;
  readonly coords: Vector<Tile>;
  readonly actorModels: ActorModelLookup;
  readonly npcType?: NpcType;
}

export function spawnNpc(world: World, init: SpawnNpcInit): EntityId {
  const npcType = init.npcType ?? init.spawn.npcType ?? init.definition.npcType;
  const model = init.actorModels.get(init.definition.modelId);
  if (!model) {
    throw new Error(
      `No actor model registered for id "${init.definition.modelId}"`,
    );
  }
  const id = world.create();
  world.add(id, NpcTag, {
    definitionId: init.definition.id,
    spawnId: init.spawn.id,
  });
  world.add(id, AreaTag, { areaId: init.spawn.areaId });
  world.add(id, Appearance, {
    modelId: init.definition.modelId,
    name: init.definition.name,
    color: npcTypeColorIndication[npcType],
    opacity: undefined,
  });
  world.add(id, Movement, {
    coords: init.coords,
    speed: init.definition.speed,
    direction: "s",
    moveTarget: undefined,
    desiredPortalId: undefined,
  });
  world.add(id, Combat, {
    hitBox: model.hitBox,
    health: init.definition.maxHealth,
    maxHealth: init.definition.maxHealth,
    alive: true,
    attackDamage: init.definition.attackDamage,
    attackSpeed: init.definition.attackSpeed,
    attackRange: init.definition.attackRange,
    attackTargetId: undefined,
    lastAttackMs: undefined,
  });
  world.add(id, NpcAi, {
    npcType,
    aggroRange: init.definition.aggroRange,
    idleSpeed: init.definition.speed,
    patrol: init.spawn.patrol,
  });
  return id;
}

const npcTypeColorIndication: Record<NpcType, number> = {
  aggressive: 0xff_00_00,
  defensive: 0x00_ff_00,
  protective: 0x00_00_ff,
  pacifist: 0xff_ff_ff,
  static: 0xff_88_00,
  patrol: 0xff_88_00,
};
