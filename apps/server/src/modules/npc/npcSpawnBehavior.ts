import type { StateAccess } from "@mp/sync/server";
import type { TickEventHandler } from "@mp/time";
import type { TileNumber } from "@mp/std";
import { randomItem, uuid } from "@mp/std";
import { clamp, vec, type Vector } from "@mp/math";
import type { AreaResource } from "@mp/data";
import type { VectorGraphNode } from "@mp/path-finding";
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
          const instance = spawnNpcInstance(npc, spawn, area);
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
  area: AreaResource,
): NPCInstance {
  const id = uuid();
  return {
    id,
    areaId: spawn.areaId,
    coords: determineSpawnCoords(spawn, area),
    speed: npc.speed,
    color: 0xff_00_00, // Hard coded to enemy color for now
  };
}

function determineSpawnCoords(
  spawn: NPCSpawn,
  area: AreaResource,
): Vector<TileNumber> {
  if (spawn.coords) {
    return spawn.coords;
  }

  let randomNode: VectorGraphNode<TileNumber> | undefined;
  if (spawn.randomRadius) {
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.random() * spawn.randomRadius;

    const randomTile = vec(
      clamp(0, Math.cos(angle) * radius, area.tiled.mapSize.x) as TileNumber,
      clamp(0, Math.sin(angle) * radius, area.tiled.mapSize.y) as TileNumber,
    );
    randomNode = area.graph.getNearestNode(randomTile);
  } else {
    randomNode = randomItem(Array.from(area.graph.getNodes()));
  }

  if (!randomNode) {
    throw new Error("No tiles available for NPC spawn");
  }

  return randomNode.data.vector;
}
