import {
  names,
  uniqueNamesGenerator,
  adjectives,
  animals,
} from "unique-names-generator";
import type { PatchStateMachine } from "@mp/sync/server";
import type { TickEventHandler } from "@mp/time";
import type { Tile, TimesPerSecond } from "@mp/std";
import { randomItem, recordValues, uuid } from "@mp/std";
import {
  clamp,
  rect_from_diameter,
  vec,
  vec_zero,
  type Vector,
} from "@mp/math";
import type { VectorGraphNode } from "@mp/path-finding";
import type { GameState } from "../GameState";
import type { AreaLookup } from "../area/loadAreas";
import type { AreaId } from "../../shared/area/AreaId";
import type { AreaResource } from "../../shared/area/AreaResource";
import type { NPCService } from "./service";
import type { NPC, NPCInstance, NPCInstanceId, NPCSpawn } from "./schema";

export function npcSpawnBehavior(
  state: PatchStateMachine<GameState>,
  npcService: NPCService,
  areas: AreaLookup,
): TickEventHandler {
  let spawns: Awaited<ReturnType<NPCService["getAllSpawnsAndTheirNpcs"]>> = [];
  void npcService.getAllSpawnsAndTheirNpcs().then((list) => {
    spawns = list;
  });

  return () => {
    for (const { spawn, npc } of spawns) {
      const area = areas.get(spawn.areaId);
      if (!area) {
        throw new Error(`Area not found: ${spawn.areaId}`);
      }

      const existingNpcs = recordValues(state.actors())
        .filter(
          (a) => a.type === "npc" && a.npcId === npc.id && a.areaId === area.id,
        )
        .toArray().length;

      const amountToSpawn = spawn.count - existingNpcs;

      for (let i = 0; i < amountToSpawn; i++) {
        const instance = spawnNpcInstance(npc, spawn, area);
        state.actors.set(instance.id, { type: "npc", ...instance });
      }
    }
  };
}

const randomAndCustomNames = [
  "Chombs",
  "Chomps",
  "Bill",
  "normal Jeff",
  "Max Power",
  ...names,
];

export function spawnNpcInstance(
  npc: NPC,
  spawn: NPCSpawn,
  area: AreaResource,
): NPCInstance {
  return createNpcInstance(
    npc,
    spawn.areaId,
    determineSpawnCoords(spawn, area),
  );
}

export function createNpcInstance(
  npc: NPC,
  areaId: AreaId,
  coords: Vector<Tile>,
): NPCInstance {
  const id = uuid() as NPCInstanceId;
  const name = uniqueNamesGenerator({
    dictionaries: [adjectives, animals, randomAndCustomNames],
    separator: " ",
    style: "capital",
    seed: id,
  });
  return {
    id,
    npcId: npc.id,
    areaId,
    coords,
    speed: npc.speed,
    color: 0xff_00_00, // Hard coded to enemy color for now
    name,
    hitBox: rect_from_diameter(vec_zero(), 1 as Tile),
    health: 25,
    maxHealth: 25,
    attackDamage: 5,
    attackRange: 1 as Tile,
    attackSpeed: 1 as TimesPerSecond,
  };
}

function determineSpawnCoords(
  spawn: NPCSpawn,
  area: AreaResource,
): Vector<Tile> {
  if (spawn.coords) {
    return spawn.coords;
  }

  let randomNode: VectorGraphNode<Tile> | undefined;
  if (spawn.randomRadius) {
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.random() * spawn.randomRadius;

    const randomTile = vec(
      clamp(0, Math.cos(angle) * radius, area.tiled.mapSize.x) as Tile,
      clamp(0, Math.sin(angle) * radius, area.tiled.mapSize.y) as Tile,
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
