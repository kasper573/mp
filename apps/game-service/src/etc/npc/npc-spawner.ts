import type { NpcType } from "@mp/game-shared";
import type {
  ActorModelLookup,
  AreaResource,
  GameState,
  NpcDefinition,
  NpcInstanceId,
  NpcSpawn,
} from "@mp/game-shared";
import { NpcInstance } from "@mp/game-shared";
import { cardinalDirections, clamp, Vector } from "@mp/math";
import type { VectorGraphNode } from "@mp/path-finding";
import type { Rng, Tile } from "@mp/std";
import { assert, createShortId, promiseFromResult, withBackoffRetries } from "@mp/std";
import type { TickEventHandler } from "@mp/time";
import { TimeSpan } from "@mp/time";
import { deriveNpcSpawnsFromArea } from "./derive-npc-spawns-from-areas";
import type { DbRepository } from "@mp/db";
import type { Logger } from "@mp/logger";

interface NpcSpawnOption {
  spawn: NpcSpawn;
  npc: NpcDefinition;
}

export class NpcSpawner {
  private options: ReadonlyArray<NpcSpawnOption> = [];

  constructor(
    private readonly area: AreaResource,
    private readonly models: ActorModelLookup,
    private readonly rng: Rng,
    private readonly db: DbRepository,
    private readonly logger: Logger,
  ) {
    // Start lazy loading spawn options with infinite retry
    void this.lazyLoadSpawnOptions();
  }

  private async lazyLoadSpawnOptions() {
    let attempt = 0;

    while (this.options.length === 0) {
      try {
        attempt++;
        this.logger.info({ attempt }, `Loading NPC spawn options...`);

        // Use withBackoffRetries with capped delay
        // oxlint-disable-next-line no-await-in-loop
        const optionsFromDB = await withBackoffRetries(
          () => promiseFromResult(this.db.selectAllSpawnAndNpcPairs(this.area.id)),
          {
            maxRetries: 10, // Try 10 times before letting outer loop retry
            initialDelay: 1000,
            factor: 2,
          },
        );

        const optionsFromTiled = deriveNpcSpawnsFromArea(
          this.area,
          optionsFromDB.map(({ npc }) => npc),
        );

        this.options = [...optionsFromDB, ...optionsFromTiled];
        this.logger.info(
          { optionCount: this.options.length },
          `NPC spawn options loaded successfully`,
        );
        return;
      } catch (error) {
        // Retry with capped delay of 30s
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30000);
        this.logger.warn(
          { error, attempt, nextRetryIn: delay },
          `Failed to load NPC spawn options after retries, will retry again...`,
        );
        // oxlint-disable-next-line no-await-in-loop
        await new Promise((res) => setTimeout(res, delay));
      }
    }
  }

  createTickHandler(state: GameState): TickEventHandler {
    const corpseDuration = TimeSpan.fromSeconds(5);
    const corpseCleanupTimers = new Map<NpcInstanceId, TimeSpan>();

    return ({ totalTimeElapsed }) => {
      // Clean up dead NPCs
      for (const actor of state.actors.values()) {
        if (actor.type !== "npc" || actor.combat.alive) {
          continue;
        }
        let cleanupTime = corpseCleanupTimers.get(actor.identity.id);
        if (!cleanupTime) {
          cleanupTime = totalTimeElapsed.add(corpseDuration);
          corpseCleanupTimers.set(actor.identity.id, cleanupTime);
        }
        if (totalTimeElapsed.compareTo(cleanupTime) >= 0) {
          state.actors.delete(actor.identity.id);
          corpseCleanupTimers.delete(actor.identity.id);
        }
      }

      for (const { spawn, npc } of this.options) {
        const currentSpawnCount = state.actors
          .values()
          .filter((a) => a.type === "npc" && a.identity.spawnId === spawn.id)
          .toArray().length;

        const amountToSpawn = spawn.count - currentSpawnCount;
        for (let i = 0; i < amountToSpawn; i++) {
          const instance = this.createInstance(npc, spawn);
          state.actors.set(instance.identity.id, instance);
        }
      }
    };
  }

  createInstance(npc: NpcDefinition, spawn: NpcSpawn): NpcInstance {
    const id = createShortId() as NpcInstanceId;
    const model = assert(this.models.get(npc.modelId));
    const coords = determineSpawnCoords(spawn, this.area, this.rng);
    const npcType = spawn.npcType ?? npc.npcType;

    return NpcInstance.create({
      type: "npc",
      identity: {
        id,
        npcId: npc.id,
        spawnId: spawn.id,
        npcType,
      },
      appearance: {
        modelId: npc.modelId,
        name: npc.name,
        color: npcTypeColorIndication[npcType], // Hard coded to enemy color for now
        opacity: undefined,
      },
      combat: {
        hitBox: model.hitBox,
        attackDamage: npc.attackDamage,
        attackRange: npc.attackRange,
        attackSpeed: npc.attackSpeed,
        health: npc.maxHealth,
        alive: true,
        maxHealth: npc.maxHealth,
        attackTargetId: undefined,
        lastAttack: undefined,
      },
      etc: {
        patrol: spawn.patrol ?? undefined,
        aggroRange: npc.aggroRange,
      },
      movement: {
        coords,
        speed: npc.speed,
        dir: this.rng.oneOf(cardinalDirections),
        desiredPortalId: undefined,
        moveTarget: undefined,
        path: undefined,
      },
    });
  }
}

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
    randomNode = area.graph.getProximityNode(randomTile);
  } else {
    randomNode = assert(area.graph.getNode(rng.oneOf(area.graph.nodeIds)));
  }

  if (!randomNode) {
    throw new Error("No tiles available for NPC spawn");
  }

  return randomNode.data.vector;
}
