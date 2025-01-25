import type { StateAccess } from "@mp/sync/server";
import type { TickEventHandler } from "@mp/time";
import { uuid } from "@mp/std";
import { clamp, type Vector } from "@mp/math";
import type { WorldState } from "../../package";
import type { AreaLookup } from "../area/loadAreas";
import type { NPCService } from "./service";
import type { NPC, NPCInstance, NPCSpawn } from "./schema";

export function npcSpawnBehavior(
  accessState: StateAccess<WorldState>,
  npcService: NPCService,
  areas: AreaLookup,
): TickEventHandler {
  void npcService.getAllSpawnsAndTheirNpcs().then((list) => {
    accessState("npcSpawnBehavior", (state) => {
      for (const { spawn, npc } of list) {
        const area = areas.get(spawn.areaId);
        if (!area) {
          throw new Error(`Area not found: ${spawn.areaId}`);
        }

        for (let i = 0; i < spawn.count; i++) {
          const instance = spawnNpcInstance(npc, spawn, {
            x: area.tiled.map.tilewidth,
            y: area.tiled.map.tileheight,
          });
          state.npcs[instance.id] = instance;
        }
      }
    });
  });

  return () => {};
}

function spawnNpcInstance(
  npc: NPC,
  spawn: NPCSpawn,
  tiledMapSize: Vector,
): NPCInstance {
  const id = uuid();
  return {
    id,
    areaId: spawn.areaId,
    coords: determineSpawnCoords(spawn, tiledMapSize),
    speed: npc.speed,
    color: 0xff_00_00, // Hard coded to enemy color for now
  };
}

function determineSpawnCoords(spawn: NPCSpawn, tiledMapSize: Vector): Vector {
  if (spawn.coords) {
    return spawn.coords;
  }

  if (spawn.randomRadius) {
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.random() * spawn.randomRadius;
    return {
      x: clamp(0, Math.cos(angle) * radius, tiledMapSize.x),
      y: clamp(0, Math.sin(angle) * radius, tiledMapSize.y),
    };
  }

  return {
    x: Math.floor(Math.random() * tiledMapSize.x),
    y: Math.floor(Math.random() * tiledMapSize.y),
  };
}
