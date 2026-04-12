import { defineModule } from "@rift/modular";
import type { Entity } from "@rift/core";
import { Vector, clamp } from "@mp/math";
import type { Path } from "@mp/math";
import { Rng } from "@mp/std";
import type { Tile } from "@mp/std";
import {
  npcs,
  npcSpawns,
  npcRewards,
  type NpcDefinition,
  type NpcSpawn,
  type NpcType,
  type NpcReward,
} from "@mp/fixtures";
import {
  Position,
  Movement,
  Combat,
  Appearance,
  NpcIdentity,
  CharacterIdentity,
  Progression,
  AreaTag,
} from "../components";
import type { AreaResource } from "../area-resource";
import { areaModule } from "./area";
import { sessionModule } from "./session";
import { movementModule } from "./movement";
import { combatModule } from "./combat";

const CORPSE_DURATION = 5; // seconds

const NPC_TYPE_INDEX: Record<NpcType, number> = {
  static: 0,
  patrol: 1,
  pacifist: 2,
  aggressive: 3,
  defensive: 4,
  protective: 5,
};

// ---------------------------------------------------------------------------
// Combat memory — tracks attack pairs observed by a single NPC
// ---------------------------------------------------------------------------

class NpcCombatMemory {
  #combats = new Map<string, [number, number]>();

  get combats() {
    return this.#combats.values();
  }

  hasAttackedEachOther(a: number, b: number): boolean {
    return this.#combats.has(combatKey(a, b));
  }

  observeAttack(attacker: number, target: number) {
    this.#combats.set(combatKey(attacker, target), [attacker, target]);
  }

  forgetEntity(entityId: number) {
    for (const [key, [a, b]] of this.#combats) {
      if (a === entityId || b === entityId) {
        this.#combats.delete(key);
      }
    }
  }
}

function combatKey(a: number, b: number): string {
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}

// ---------------------------------------------------------------------------
// AI Task types
// ---------------------------------------------------------------------------

interface NpcTaskCtx {
  area: AreaResource;
  rng: Rng;
  totalElapsed: number;
  // Movement helpers
  setMoveTarget(entity: Entity, target: Vector<Tile>): void;
  clearPath(entity: Entity): void;
  hasPath(entity: Entity): boolean;
  setPath(entity: Entity, path: Path<Tile>): void;
  // Combat helpers
  setAttackTarget(entity: Entity, targetId: number): void;
  clearAttackTarget(entity: Entity): void;
  getAttackTarget(entityId: number): number | undefined;
  isTargetable(entity: Entity): boolean;
  // Queries
  getEntityPosition(entityId: number): Vector<Tile> | undefined;
  findCharactersInRange(pos: Vector<Tile>, range: Tile): Entity[];
  findNpcsWithSpawn(spawnId: string): Entity[];
  getCombatMemory(entityId: number): NpcCombatMemory | undefined;
  entityPosition(entity: Entity): Vector<Tile>;
}

type Task = (ctx: NpcTaskCtx, entity: Entity, npcState: NpcServerState) => Task;

// ---------------------------------------------------------------------------
// Per-NPC server-only state
// ---------------------------------------------------------------------------

interface NpcServerState {
  task: Task;
  combatMemory: NpcCombatMemory;
  corpseTimer: number | undefined; // totalElapsed time to cleanup
  npcDef: NpcDefinition;
  spawn: NpcSpawn;
  npcType: NpcType;
  aggroRange: Tile;
  patrol: Path<Tile> | undefined;
}

// ---------------------------------------------------------------------------
// Task factories
// ---------------------------------------------------------------------------

function createIdleTask(endTime?: number, nextTask?: Task): Task {
  return function idle(ctx, entity, state) {
    if (endTime !== undefined && ctx.totalElapsed > endTime) {
      return nextTask ? nextTask(ctx, entity, state) : idle;
    }
    ctx.clearPath(entity);
    return idle;
  };
}

function createWanderTask(endTime: number, nextTask: Task): Task {
  return function wander(ctx, entity, state) {
    if (ctx.totalElapsed > endTime) {
      return nextTask(ctx, entity, state);
    }
    if (!ctx.hasPath(entity)) {
      const nodeId = ctx.rng.oneOf(ctx.area.graph.nodeIds);
      const node = ctx.area.graph.getNode(nodeId);
      if (node) {
        ctx.setMoveTarget(entity, node.data.vector);
        ctx.clearAttackTarget(entity);
      }
    }
    return wander;
  };
}

function createPatrolTask(path: Path<Tile>): Task {
  let reversePath = false;
  return function patrol(ctx, entity) {
    if (!ctx.hasPath(entity)) {
      const nextPath = reversePath ? path.toReversed() : path;
      reversePath = !reversePath;
      ctx.setPath(entity, nextPath);
    }
    return patrol;
  };
}

function idleOrWander(rng: Rng, totalElapsed: number): Task {
  const endTime = totalElapsed + 5;
  return rng.oneOf([
    createIdleTask(endTime, (ctx) => idleOrWander(ctx.rng, ctx.totalElapsed)),
    createWanderTask(endTime, (ctx) => idleOrWander(ctx.rng, ctx.totalElapsed)),
  ]);
}

// ---------------------------------------------------------------------------
// Hunt task + filters
// ---------------------------------------------------------------------------

type HuntFilter = (
  ctx: NpcTaskCtx,
  entity: Entity,
  state: NpcServerState,
) => number | undefined;

function createHuntTask(findEnemy: HuntFilter): Task {
  return function hunt(ctx, entity, state) {
    const currentTarget = ctx.getAttackTarget(entity.id);
    if (currentTarget !== undefined) {
      const pos = ctx.entityPosition(entity);
      const targetPos = ctx.getEntityPosition(currentTarget);
      if (!targetPos || !pos.isWithinDistance(targetPos, state.aggroRange)) {
        // Target out of range or gone — lose aggro
        ctx.clearAttackTarget(entity);
        ctx.clearPath(entity);
        entity.get(Movement).speed = 1 as Tile;
      }
      return hunt;
    }

    const newEnemyId = findEnemy(ctx, entity, state);
    if (newEnemyId !== undefined) {
      ctx.setAttackTarget(entity, newEnemyId);
      entity.get(Movement).speed = 2 as Tile;
      return hunt;
    }

    // No enemy in sight — wander randomly
    if (!ctx.hasPath(entity)) {
      const nodeId = ctx.rng.oneOf(ctx.area.graph.nodeIds);
      const node = ctx.area.graph.getNode(nodeId);
      if (node) {
        ctx.setMoveTarget(entity, node.data.vector);
      }
      entity.get(Movement).speed = 1 as Tile;
    }

    return hunt;
  };
}

const aggressiveHuntFilter: HuntFilter = (ctx, entity, state) => {
  const pos = ctx.entityPosition(entity);
  const targets = ctx.findCharactersInRange(pos, state.aggroRange);
  return targets[0]?.id;
};

const defensiveHuntFilter: HuntFilter = (ctx, entity, state) => {
  const pos = ctx.entityPosition(entity);
  const memory = ctx.getCombatMemory(entity.id);
  const targets = ctx.findCharactersInRange(pos, state.aggroRange);
  const target = targets.find((c) =>
    memory?.hasAttackedEachOther(c.id, entity.id),
  );
  return target?.id;
};

const protectiveHuntFilter: HuntFilter = (ctx, entity, state) => {
  const pos = ctx.entityPosition(entity);
  const memory = ctx.getCombatMemory(entity.id);
  if (!memory) {
    return undefined;
  }

  const allies = new Set(
    ctx.findNpcsWithSpawn(state.spawn.id).map((e) => e.id),
  );

  // Actors attacking allies are enemies
  const enemyIds = new Set<number>();
  for (const [a, b] of memory.combats) {
    if (allies.has(a)) {
      enemyIds.add(b);
    } else if (allies.has(b)) {
      enemyIds.add(a);
    }
  }

  const targets = ctx.findCharactersInRange(pos, state.aggroRange);
  const target = targets.find(
    (c) => enemyIds.has(c.id) || memory.hasAttackedEachOther(c.id, entity.id),
  );
  return target?.id;
};

function deriveInitialTask(
  npcType: NpcType,
  state: NpcServerState,
  rng: Rng,
  totalElapsed: number,
): Task {
  switch (npcType) {
    case "static":
      return createIdleTask();
    case "patrol": {
      if (!state.patrol) {
        throw new Error(
          `NPC spawn "${state.spawn.id}" of type "patrol" has no patrol path`,
        );
      }
      return createPatrolTask(state.patrol);
    }
    case "pacifist":
      return idleOrWander(rng, totalElapsed);
    case "aggressive":
      return createHuntTask(aggressiveHuntFilter);
    case "defensive":
      return createHuntTask(defensiveHuntFilter);
    case "protective":
      return createHuntTask(protectiveHuntFilter);
  }
}

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------

export const npcModule = defineModule({
  dependencies: [areaModule, sessionModule, movementModule, combatModule],
  server: (ctx) => {
    const { areas: areaMap } = ctx.using(areaModule);
    const session = ctx.using(sessionModule);
    const movement = ctx.using(movementModule);
    const combat = ctx.using(combatModule);

    const rng = new Rng();
    const npcStates = new Map<number, NpcServerState>();
    let totalElapsed = 0;

    // Build lookup for NPC definitions by id
    const npcLookup = new Map(npcs.map((n) => [n.id, n]));
    // Build lookup for rewards by npcId
    const rewardsByNpc = new Map<string, NpcReward[]>();
    for (const reward of npcRewards) {
      const existing = rewardsByNpc.get(reward.npcId);
      if (existing) {
        existing.push(reward);
      } else {
        rewardsByNpc.set(reward.npcId, [reward]);
      }
    }

    // Queries for AI tasks
    const characterQuery = ctx.rift.query(Position, Combat, CharacterIdentity);
    const npcQuery = ctx.rift.query(Position, Combat, NpcIdentity);

    function spawnNpc(
      area: AreaResource,
      npcDef: NpcDefinition,
      spawn: NpcSpawn,
    ) {
      const npcType = spawn.npcType ?? npcDef.npcType;
      const coords = determineSpawnCoords(spawn, area, rng);
      const entity = ctx.rift.spawn();

      entity.set(Position, coords);
      entity.set(Movement, {
        speed: npcDef.speed,
        dir: Math.floor(rng.next() * 8),
        moving: false,
      });
      entity.set(Combat, {
        health: npcDef.maxHealth,
        maxHealth: npcDef.maxHealth,
        alive: true,
        attackDamage: npcDef.attackDamage,
        attackSpeed: npcDef.attackSpeed,
        attackRange: npcDef.attackRange,
      });
      entity.set(Appearance, {
        modelId: npcDef.modelId,
        name: npcDef.name,
      });
      entity.set(NpcIdentity, {
        npcType: NPC_TYPE_INDEX[npcType],
        spawnId: spawn.id,
      });
      entity.set(AreaTag, { areaId: spawn.areaId });

      const state: NpcServerState = {
        task: createIdleTask(), // replaced on first AI tick
        combatMemory: new NpcCombatMemory(),
        corpseTimer: undefined,
        npcDef,
        spawn,
        npcType,
        aggroRange: npcDef.aggroRange,
        patrol: spawn.patrol,
      };
      state.task = deriveInitialTask(npcType, state, rng, totalElapsed);
      npcStates.set(entity.id, state);
    }

    // Initial spawn
    for (const spawn of npcSpawns) {
      const npcDef = npcLookup.get(spawn.npcId);
      if (!npcDef) {
        continue;
      }
      const area = areaMap.get(spawn.areaId);
      if (!area) {
        continue;
      }
      for (let i = 0; i < spawn.count; i++) {
        spawnNpc(area, npcDef, spawn);
      }
    }

    // --- Task context builder ---
    function buildTaskCtx(area: AreaResource): NpcTaskCtx {
      return {
        area,
        rng,
        totalElapsed,
        setMoveTarget: (e, t) => movement.setMoveTarget(e, t),
        clearPath: (e) => movement.clearPath(e),
        hasPath: (e) => movement.hasPath(e),
        setPath: (e, p) => movement.setPath(e, p),
        setAttackTarget: (e, t) => combat.setAttackTarget(e, t),
        clearAttackTarget: (e) => combat.clearAttackTarget(e),
        getAttackTarget: (id) => combat.getAttackTarget(id),
        isTargetable: (e) => combat.isTargetable(e),
        getEntityPosition: (id) => findEntityPosById(id),
        findCharactersInRange(pos, range) {
          const results: Entity[] = [];
          for (const c of characterQuery.value) {
            const cc = c.get(Combat);
            if (!cc.alive) {
              continue;
            }
            const cp = c.get(Position);
            if (pos.isWithinDistance(cp, range)) {
              results.push(c);
            }
          }
          return results;
        },
        findNpcsWithSpawn(spawnId) {
          const results: Entity[] = [];
          for (const n of npcQuery.value) {
            if (n.get(NpcIdentity).spawnId === spawnId) {
              results.push(n);
            }
          }
          return results;
        },
        getCombatMemory(entityId) {
          return npcStates.get(entityId)?.combatMemory;
        },
        entityPosition(entity) {
          return entity.get(Position);
        },
      };
    }

    function observeAttacks() {
      for (const attack of combat.attacksThisTick) {
        for (const npcEntity of npcQuery.value) {
          const nState = npcStates.get(npcEntity.id);
          if (!nState || !npcEntity.get(Combat).alive) continue;
          const npcPos = npcEntity.get(Position);
          const attackerPos = findEntityPosById(attack.attackerId);
          const targetPos = findEntityPosById(attack.targetId);
          const inRange =
            (attackerPos &&
              npcPos.isWithinDistance(attackerPos, nState.aggroRange)) ||
            (targetPos &&
              npcPos.isWithinDistance(targetPos, nState.aggroRange));
          if (inRange) {
            nState.combatMemory.observeAttack(
              attack.attackerId,
              attack.targetId,
            );
          }
        }
      }
    }

    function handleNpcDeaths() {
      for (const death of combat.deathsThisTick) {
        const nState = npcStates.get(death.entityId);
        if (!nState) continue;
        nState.corpseTimer = totalElapsed + CORPSE_DURATION;
        const killerEntity = ctx.rift.entity(death.killedBy);
        if (killerEntity?.has(CharacterIdentity)) {
          giveNpcRewards(killerEntity, nState.npcDef.id);
        }
        for (const [, state] of npcStates) {
          state.combatMemory.forgetEntity(death.entityId);
        }
      }
    }

    function cleanupCorpses() {
      for (const npcEntity of npcQuery.value) {
        const nState = npcStates.get(npcEntity.id);
        if (!nState) continue;
        if (
          nState.corpseTimer !== undefined &&
          totalElapsed >= nState.corpseTimer
        ) {
          ctx.rift.destroy(npcEntity);
          npcStates.delete(npcEntity.id);
        }
      }
    }

    function respawnNpcs() {
      for (const spawn of npcSpawns) {
        const npcDef = npcLookup.get(spawn.npcId);
        if (!npcDef) continue;
        const area = areaMap.get(spawn.areaId);
        if (!area) continue;

        let currentCount = 0;
        for (const n of npcQuery.value) {
          if (n.get(NpcIdentity).spawnId === spawn.id && n.get(Combat).alive) {
            currentCount++;
          }
        }
        for (let i = currentCount; i < spawn.count; i++) {
          spawnNpc(area, npcDef, spawn);
        }
      }
    }

    function runAiTasks() {
      for (const npcEntity of npcQuery.value) {
        const nState = npcStates.get(npcEntity.id);
        if (!nState || !npcEntity.get(Combat).alive) continue;
        const areaId = session.getEntityArea(npcEntity);
        const area = areaMap.get(areaId);
        if (!area) continue;
        const taskCtx = buildTaskCtx(area);
        nState.task = nState.task(taskCtx, npcEntity, nState);
      }
    }

    ctx.onTick((dt) => {
      totalElapsed += dt;
      observeAttacks();
      handleNpcDeaths();
      cleanupCorpses();
      respawnNpcs();
      runAiTasks();
    });

    // --- Cleanup on entity removal ---
    npcQuery.onChange((event) => {
      if (event.type === "removed") {
        npcStates.delete(event.entity.id);
      }
    });

    // --- Helpers ---

    function findEntityPosById(entityId: number): Vector<Tile> | undefined {
      const entity = ctx.rift.entity(entityId);
      if (entity?.has(Position)) {
        return entity.get(Position);
      }
      return undefined;
    }

    function giveNpcRewards(recipient: Entity, npcDefId: string) {
      const rewards = rewardsByNpc.get(npcDefId);
      if (!rewards) {
        return;
      }
      for (const reward of rewards) {
        switch (reward.type) {
          case "xp": {
            if (recipient.has(Progression)) {
              recipient.get(Progression).xp += reward.xp;
            }
            break;
          }
          case "item": {
            // Item rewards handled by inventory module (TODO)
            break;
          }
        }
      }
    }

    return { api: {} };
  },
});

// ---------------------------------------------------------------------------
// Spawn coordinate helpers
// ---------------------------------------------------------------------------

function determineSpawnCoords(
  spawn: NpcSpawn,
  area: AreaResource,
  rng: Rng,
): Vector<Tile> {
  if (spawn.coords) {
    return spawn.coords;
  }

  if (spawn.randomRadius) {
    const angle = rng.next() * Math.PI * 2;
    const radius = rng.next() * spawn.randomRadius;
    const randomTile = new Vector(
      clamp(0, Math.cos(angle) * radius, area.tiled.mapSize.x) as Tile,
      clamp(0, Math.sin(angle) * radius, area.tiled.mapSize.y) as Tile,
    );
    const node = area.graph.getProximityNode(randomTile);
    if (node) {
      return node.data.vector;
    }
  }

  // Random walkable tile
  const nodeId = rng.oneOf(area.graph.nodeIds);
  const node = area.graph.getNode(nodeId);
  if (!node) {
    throw new Error("No walkable tiles available for NPC spawn");
  }
  return node.data.vector;
}
