import type { TickEventHandler } from "@mp/time";
import { TimeSpan } from "@mp/time";
import type { Tile } from "@mp/std";
import { assert, createShortId, randomItem, recordValues } from "@mp/std";
import { cardinalDirections, clamp, Vector } from "@mp/math";
import type { VectorGraphNode } from "@mp/path-finding";
import type { GameStateMachine } from "../game-state";
import type { AreaLookup } from "../area/lookup";
import type { AreaId } from "../../shared/area/area-id";
import type { AreaResource } from "../../shared/area/area-resource";
import type { ActorModelLookup } from "../traits/appearance";
import type { NpcService } from "./service";
import type { Npc, NpcInstance, NpcInstanceId, NpcSpawn } from "./schema";

export class NpcSpawner {
  constructor(
    private readonly areas: AreaLookup,
    private readonly models: ActorModelLookup,
  ) {}

  createSpawnBehavior(
    state: GameStateMachine,
    npcService: NpcService,
  ): TickEventHandler {
    let spawns: Awaited<ReturnType<NpcService["getAllSpawnsAndTheirNpcs"]>> =
      [];
    void npcService.getAllSpawnsAndTheirNpcs().then((list) => {
      spawns = list;
    });

    const corpseDuration = TimeSpan.fromSeconds(5);
    const corpseCleanupTimers = new Map<NpcInstanceId, TimeSpan>();

    return ({ totalTimeElapsed }) => {
      // Clean up dead NPCs
      for (const actor of recordValues(state.actors())) {
        if (actor.type === "npc" && actor.health <= 0) {
          let cleanupTime = corpseCleanupTimers.get(actor.id);
          if (!cleanupTime) {
            cleanupTime = totalTimeElapsed.add(corpseDuration);
            corpseCleanupTimers.set(actor.id, cleanupTime);
          }
          if (cleanupTime <= totalTimeElapsed) {
            state.actors.remove(actor.id);
            corpseCleanupTimers.delete(actor.id);
          }
        }
      }

      for (const { spawn, npc } of spawns) {
        const existingNpcs = recordValues(state.actors())
          .filter(
            (a) =>
              a.type === "npc" &&
              a.npcId === npc.id &&
              a.areaId === spawn.areaId,
          )
          .toArray().length;

        const amountToSpawn = spawn.count - existingNpcs;

        for (let i = 0; i < amountToSpawn; i++) {
          const instance = this.spawnInstance(npc, spawn);
          state.actors.set(instance.id, { type: "npc", ...instance });
        }
      }
    };
  }

  spawnInstance(npc: Npc, spawn: NpcSpawn): NpcInstance {
    const area = assert(this.areas.get(spawn.areaId));
    return this.createInstance(
      npc,
      spawn.areaId,
      determineSpawnCoords(spawn, area),
    );
  }

  createInstance(
    { id: npcId, ...inheritedProps }: Npc,
    areaId: AreaId,
    coords: Vector<Tile>,
  ): NpcInstance {
    const id = createShortId() as NpcInstanceId;
    const model = assert(this.models.get(inheritedProps.modelId));
    return {
      id,
      npcId,
      areaId,
      coords,
      color: 0xff_00_00, // Hard coded to enemy color for now
      hitBox: model.hitBox,
      dir: assert(randomItem(cardinalDirections)),
      health: inheritedProps.maxHealth,
      ...inheritedProps,
    };
  }
}

function determineSpawnCoords(
  spawn: NpcSpawn,
  area: AreaResource,
): Vector<Tile> {
  if (spawn.coords) {
    return spawn.coords;
  }

  let randomNode: VectorGraphNode<Tile> | undefined;
  if (spawn.randomRadius) {
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.random() * spawn.randomRadius;

    const randomTile = new Vector(
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
