import type { TickEventHandler } from "@mp/time";
import { TimeSpan } from "@mp/time";
import type { Rng, Tile } from "@mp/std";
import { assert, createShortId } from "@mp/std";
import { cardinalDirections, clamp, Vector } from "@mp/math";
import type { VectorGraphNode } from "@mp/path-finding";
import { InjectionContext } from "@mp/ioc";
import type { GameState } from "../game-state/game-state";
import type { AreaLookup } from "../area/lookup";
import type { AreaResource } from "../area/area-resource";
import type { ActorModelLookup } from "../traits/appearance";
import { NpcInstance } from "./types";
import type { Npc, NpcType, NpcInstanceId, NpcSpawn } from "./types";

export class NpcSpawner {
  constructor(
    private readonly areas: AreaLookup,
    private readonly models: ActorModelLookup,
    public readonly options: Array<{ spawn: NpcSpawn; npc: Npc }>,
    private readonly rng: Rng,
  ) {}

  createTickHandler(state: GameState): TickEventHandler {
    const corpseDuration = TimeSpan.fromSeconds(5);
    const corpseCleanupTimers = new Map<NpcInstanceId, TimeSpan>();

    return ({ totalTimeElapsed }) => {
      // Clean up dead NPCs
      for (const actor of state.actors.index.access<NpcInstance>({
        type: "npc",
        alive: false,
      })) {
        let cleanupTime = corpseCleanupTimers.get(actor.id);
        if (!cleanupTime) {
          cleanupTime = totalTimeElapsed.add(corpseDuration);
          corpseCleanupTimers.set(actor.id, cleanupTime);
        }
        if (totalTimeElapsed.compareTo(cleanupTime) >= 0) {
          state.actors.delete(actor.id);
          corpseCleanupTimers.delete(actor.id);
        }
      }

      for (const { spawn, npc } of this.options) {
        const currentSpawnCount = state.actors.index
          .access<NpcInstance>({ spawnId: spawn.id })
          .toArray().length;

        const amountToSpawn = spawn.count - currentSpawnCount;
        for (let i = 0; i < amountToSpawn; i++) {
          const instance = this.createInstance(npc, spawn);
          state.actors.set(instance.id, instance);
        }
      }
    };
  }

  createInstance(npc: Npc, spawn: NpcSpawn): NpcInstance {
    const id = createShortId() as NpcInstanceId;
    const model = assert(this.models.get(npc.modelId));
    const area = assert(this.areas.get(spawn.areaId));
    const coords = determineSpawnCoords(spawn, area, this.rng);
    const npcType = spawn.npcType ?? npc.npcType;
    return new NpcInstance({
      ...npc,
      id,
      npcId: npc.id,
      spawnId: spawn.id,
      areaId: spawn.areaId,
      coords,
      npcType,
      color: npcTypeColorIndication[npcType], // Hard coded to enemy color for now
      hitBox: model.hitBox,
      dir: this.rng.oneOf(cardinalDirections),
      health: npc.maxHealth,
      patrol: spawn.patrol ?? undefined,
    });
  }
}

export const ctxNpcSpawner = InjectionContext.new<NpcSpawner>("NpcSpawner");

const npcTypeColorIndication: Record<NpcType, number> = {
  aggressive: 0xff_00_00,
  defensive: 0x00_ff_00,
  protective: 0x00_00_ff,
  pacifist: 0xff_ff_ff,
  static: 0xff_88_00,
  patrol: 0xff_88_00,
};

function determineSpawnCoords(
  spawn: NpcSpawn,
  area: AreaResource,
  rng: Rng,
): Vector<Tile> {
  if (spawn.coords) {
    return spawn.coords;
  }

  let randomNode: VectorGraphNode<Tile> | undefined;
  if (spawn.randomRadius) {
    const angle = rng.next() * Math.PI * 2;
    const radius = rng.next() * spawn.randomRadius;

    const randomTile = new Vector(
      clamp(0, Math.cos(angle) * radius, area.tiled.mapSize.x) as Tile,
      clamp(0, Math.sin(angle) * radius, area.tiled.mapSize.y) as Tile,
    );
    randomNode = area.graph.getNearestNode(randomTile);
  } else {
    randomNode = assert(area.graph.getNode(rng.oneOf(area.graph.nodeIds)));
  }

  if (!randomNode) {
    throw new Error("No tiles available for NPC spawn");
  }

  return randomNode.data.vector;
}
