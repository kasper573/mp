import {
  names,
  uniqueNamesGenerator,
  adjectives,
  animals,
} from "unique-names-generator";
import type { PatchStateMachine } from "@mp/sync/server";
import type { TickEventHandler } from "@mp/time";
import type { Tile } from "@mp/std";
import { randomItem, uuid } from "@mp/std";
import { clamp, vec, type Vector } from "@mp/math";
import type { AreaId, AreaResource } from "@mp/data";
import type { VectorGraphNode } from "@mp/path-finding";
import type { NPCInstanceId, WorldState } from "../../package";
import type { AreaLookup } from "../area/loadAreas";
import type { NPCService } from "./service";
import type { NPC, NPCInstance, NPCSpawn } from "./schema";

export function npcSpawnBehavior(
  state: PatchStateMachine<WorldState>,
  npcService: NPCService,
  areas: AreaLookup,
): TickEventHandler {
  void npcService.getAllSpawnsAndTheirNpcs().then((list) => {
    for (const { spawn, npc } of list) {
      const area = areas.get(spawn.areaId);
      if (!area) {
        throw new Error(`Area not found: ${spawn.areaId}`);
      }

      for (let i = 0; i < spawn.count; i++) {
        const instance = spawnNpcInstance(npc, spawn, area);
        state.actors.set(instance.id, { type: "npc", ...instance });
      }
    }
  });

  return () => {};
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
    areaId,
    coords,
    speed: npc.speed,
    color: 0xff_00_00, // Hard coded to enemy color for now
    name,
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
