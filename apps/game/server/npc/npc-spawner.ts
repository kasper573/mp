import type { TickEventHandler } from "@mp/time";
import { TimeSpan } from "@mp/time";
import type { Tile } from "@mp/std";
import { assert, createShortId, randomItem, recordValues } from "@mp/std";
import { cardinalDirections, clamp, Vector } from "@mp/math";
import type { VectorGraphNode } from "@mp/path-finding";
import type { GameStateMachine } from "../game-state";
import type { AreaLookup } from "../area/lookup";
import type { AreaResource } from "../../shared/area/area-resource";
import type { ActorModelLookup } from "../traits/appearance";
import type { NpcService } from "./service";
import type {
  Npc,
  NpcAggroType,
  NpcInstance,
  NpcInstanceId,
  NpcSpawn,
} from "./schema";

export class NpcSpawner {
  constructor(
    private readonly areas: AreaLookup,
    private readonly models: ActorModelLookup,
  ) {}

  createTickHandler(
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
        const currentSpawnCount = recordValues(state.actors())
          .filter(
            (actor) =>
              actor.type === "npc" &&
              actor.areaId === spawn.areaId &&
              actor.spawnId === spawn.id,
          )
          .toArray().length;

        const amountToSpawn = spawn.count - currentSpawnCount;

        for (let i = 0; i < amountToSpawn; i++) {
          const instance = this.createInstance(npc, spawn);
          state.actors.set(instance.id, { type: "npc", ...instance });
        }
      }
    };
  }

  createInstance(npc: Npc, spawn: NpcSpawn): NpcInstance {
    const id = createShortId() as NpcInstanceId;
    const model = assert(this.models.get(npc.modelId));
    const area = assert(this.areas.get(spawn.areaId));
    const coords = determineSpawnCoords(spawn, area);
    const aggroType = spawn.aggroType ?? npc.aggroType;
    return {
      ...npc,
      id,
      npcId: npc.id,
      spawnId: spawn.id,
      areaId: spawn.areaId,
      coords,
      aggroType,
      color: aggroTypeColorIndication[aggroType], // Hard coded to enemy color for now
      hitBox: model.hitBox,
      dir: assert(randomItem(cardinalDirections)),
      health: npc.maxHealth,
    };
  }
}

const aggroTypeColorIndication: Record<NpcAggroType, number> = {
  aggressive: 0xff_00_00,
  defensive: 0x00_ff_00,
  protective: 0x00_00_ff,
  pacifist: 0xff_ff_ff,
};

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
