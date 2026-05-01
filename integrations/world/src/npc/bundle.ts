import type { World, EntityId } from "@rift/core";
import type { Tile } from "@mp/std";
import { AreaTag } from "../area/components";
import { Appearance } from "../appearance/components";
import { Movement } from "../movement/components";
import { Combat } from "../combat/components";
import { NpcTag } from "../identity/components";
import { NpcAi } from "./components";
import type { NpcDefinition, NpcSpawn, NpcType } from "./definitions";

export interface SpawnNpcInit {
  readonly definition: NpcDefinition;
  readonly spawn: NpcSpawn;
  readonly coords: { readonly x: Tile; readonly y: Tile };
  readonly npcType?: NpcType;
}

export function spawnNpc(world: World, init: SpawnNpcInit): EntityId {
  const npcType = init.npcType ?? init.spawn.npcType ?? init.definition.npcType;
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
    path: [],
    moveTarget: undefined,
  });
  world.add(id, Combat, {
    hitBox: {
      x: init.coords.x,
      y: init.coords.y,
      width: 1 as Tile,
      height: 1 as Tile,
    },
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
    patrol: init.spawn.patrol?.map((v) => ({ x: v.x, y: v.y })),
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
