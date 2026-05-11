import type { Cleanup, Feature } from "../feature";
import { Tick, type EntityId, type World } from "@rift/core";
import type { Vector } from "@mp/math";
import { combine, Rng, type Tile } from "@mp/std";
import type { AreaResource } from "../area/area-resource";
import type { AreaId, NpcSpawnId } from "@mp/fixtures";
import { AreaTag } from "../area/components";
import { CharacterTag, NpcTag } from "../identity/components";
import { NpcAi } from "./components";
import { Combat } from "../combat/components";
import { Attacked, Died } from "../combat/events";
import { Movement, PathFollow } from "../movement/components";

const PACIFIST_WANDER_CHANCE = 0.4;
// Speed >= 2 triggers the run animation in actor-controller.ts.
const CHASE_SPEED_MULTIPLIER = 2;

export interface NpcAiOptions {
  readonly areas: ReadonlyMap<AreaId, AreaResource>;
  readonly rng?: Rng;
}

class CombatMemory {
  readonly #combats = new Map<EntityId, Map<EntityId, Set<EntityId>>>();

  observe(observer: EntityId, attacker: EntityId, target: EntityId): void {
    let attackers = this.#combats.get(observer);
    if (!attackers) {
      attackers = new Map();
      this.#combats.set(observer, attackers);
    }
    let targets = attackers.get(attacker);
    if (!targets) {
      targets = new Set();
      attackers.set(attacker, targets);
    }
    targets.add(target);
  }

  forEachCombat(
    observer: EntityId,
    visit: (attacker: EntityId, target: EntityId) => void,
  ): void {
    const attackers = this.#combats.get(observer);
    if (!attackers) {
      return;
    }
    attackers.forEach((targets, attacker) => {
      targets.forEach((target) => visit(attacker, target));
    });
  }

  hasAttacked(
    observer: EntityId,
    attacker: EntityId,
    target: EntityId,
  ): boolean {
    return this.#combats.get(observer)?.get(attacker)?.has(target) ?? false;
  }

  forget(deadActorId: EntityId): void {
    this.#combats.delete(deadActorId);
    for (const [observer, attackers] of this.#combats) {
      attackers.delete(deadActorId);
      for (const targets of attackers.values()) {
        targets.delete(deadActorId);
      }
      if (attackers.size === 0) {
        this.#combats.delete(observer);
      }
    }
  }

  clear(): void {
    this.#combats.clear();
  }
}

interface AiCtx {
  readonly world: World;
  readonly memory: CombatMemory;
  readonly ralliesBySpawn: Map<NpcSpawnId, EntityId[]>;
  readonly pickRandomWalkable: (area: AreaResource) => Vector<Tile>;
  readonly rng: Rng;
  readonly areas: ReadonlyMap<AreaId, AreaResource>;
}

export function npcAiFeature(opts: NpcAiOptions): Feature {
  const rng = opts.rng ?? new Rng();
  return {
    server(server): Cleanup {
      const memory = new CombatMemory();
      const walkableNodesByArea = new WeakMap<
        AreaResource,
        ReadonlyArray<Vector<Tile>>
      >();

      function pickRandomWalkable(area: AreaResource): Vector<Tile> {
        let nodes = walkableNodesByArea.get(area);
        if (!nodes) {
          const list: Vector<Tile>[] = [];
          for (const id of area.graph.nodeIds) {
            const node = area.graph.getNode(id);
            if (node) {
              list.push(node.data.vector);
            }
          }
          nodes = list;
          walkableNodesByArea.set(area, nodes);
        }
        if (nodes.length === 0) {
          return area.start;
        }
        return rng.oneOf(nodes);
      }

      return combine(
        server.on(Died, (event) => {
          memory.forget(event.data);
        }),

        server.on(Attacked, (event) => {
          const { entityId: attacker, targetId } = event.data;
          const attackerMv = server.world.get(attacker, Movement);
          const targetMv = server.world.get(targetId, Movement);
          for (const [observerId, ai, observerMv] of server.world.query(
            NpcAi,
            Movement,
          )) {
            if (observerId === attacker) {
              continue;
            }
            const seesAttacker =
              attackerMv?.coords.isWithinDistance(
                observerMv.coords,
                ai.aggroRange,
              ) ?? false;
            const seesTarget =
              targetMv?.coords.isWithinDistance(
                observerMv.coords,
                ai.aggroRange,
              ) ?? false;
            if (seesAttacker || seesTarget) {
              memory.observe(observerId, attacker, targetId);
            }
          }
        }),

        server.on(Tick, () => {
          const ctx: AiCtx = {
            world: server.world,
            memory,
            ralliesBySpawn: buildAllyIndex(server.world),
            pickRandomWalkable,
            rng,
            areas: opts.areas,
          };
          for (const [id] of server.world.query(NpcAi)) {
            stepNpc(ctx, id);
          }
        }),

        () => memory.clear(),
      );
    },
  };
}

function buildAllyIndex(world: World): Map<NpcSpawnId, EntityId[]> {
  const out = new Map<NpcSpawnId, EntityId[]>();
  for (const [id, tag] of world.query(NpcTag)) {
    let bucket = out.get(tag.spawnId);
    if (!bucket) {
      bucket = [];
      out.set(tag.spawnId, bucket);
    }
    bucket.push(id);
  }
  return out;
}

function stepNpc(ctx: AiCtx, id: EntityId): void {
  const [ai, mv, areaTag, combat] = ctx.world.get(
    id,
    NpcAi,
    Movement,
    AreaTag,
    Combat,
  );
  if (!ai || !mv || !areaTag || !combat) {
    return;
  }
  const area = ctx.areas.get(areaTag.areaId);
  if (!area) {
    return;
  }

  if (!combat.alive) {
    clearActions(ctx, id);
    return;
  }

  if (combat.attackTargetId !== undefined) {
    const stillEngaged = stillInRange(
      ctx,
      combat.attackTargetId,
      mv.coords,
      areaTag.areaId,
      ai.aggroRange,
    );
    if (!stillEngaged) {
      ctx.world.remove(id, PathFollow);
      ctx.world.write(id, Combat, { attackTargetId: undefined });
      ctx.world.write(id, Movement, {
        moveTarget: undefined,
        speed: ai.idleSpeed,
      });
    }
  }

  if (combat.attackTargetId !== undefined) {
    return;
  }

  const target = findAggroTarget(ctx, id, areaTag.areaId);
  if (target !== undefined) {
    ctx.world.write(id, Combat, { attackTargetId: target });
    ctx.world.write(id, Movement, {
      speed: (ai.idleSpeed * CHASE_SPEED_MULTIPLIER) as Tile,
    });
    return;
  }

  applyIdleBehaviour(ctx, id, area);
}

function stillInRange(
  ctx: AiCtx,
  targetId: EntityId,
  selfCoords: Vector<Tile>,
  selfArea: AreaId,
  aggroRange: number,
): boolean {
  const [targetMv, targetArea, targetCombat] = ctx.world.get(
    targetId,
    Movement,
    AreaTag,
    Combat,
  );
  if (!targetMv || !targetArea || !targetCombat || !targetCombat.alive) {
    return false;
  }
  if (targetArea.areaId !== selfArea) {
    return false;
  }
  return targetMv.coords.isWithinDistance(selfCoords, aggroRange);
}

function clearActions(ctx: AiCtx, id: EntityId): void {
  const [combat, mv] = ctx.world.get(id, Combat, Movement);
  if (!combat || !mv) {
    return;
  }
  const hadPath = ctx.world.has(id, PathFollow);
  if (combat.attackTargetId !== undefined || mv.moveTarget || hadPath) {
    ctx.world.remove(id, PathFollow);
    ctx.world.write(id, Combat, { attackTargetId: undefined });
    ctx.world.write(id, Movement, { moveTarget: undefined });
  }
}

function applyIdleBehaviour(
  ctx: AiCtx,
  id: EntityId,
  area: AreaResource,
): void {
  const [ai, mv] = ctx.world.get(id, NpcAi, Movement);
  if (!ai || !mv) {
    return;
  }
  if (mv.moveTarget || ctx.world.has(id, PathFollow)) {
    return;
  }

  switch (ai.npcType) {
    case "static":
      return;
    case "patrol":
      if (ai.patrol && ai.patrol.length > 0) {
        ctx.world.write(id, Movement, {
          moveTarget: pickFarthestPoint(mv.coords, ai.patrol),
        });
      }
      return;
    case "pacifist":
      if (ctx.rng.next() < PACIFIST_WANDER_CHANCE) {
        ctx.world.write(id, Movement, {
          moveTarget: ctx.pickRandomWalkable(area),
        });
      }
      return;
    case "aggressive":
    case "defensive":
    case "protective":
      ctx.world.write(id, Movement, {
        moveTarget: ctx.pickRandomWalkable(area),
      });
      return;
  }
}

function findAggroTarget(
  ctx: AiCtx,
  selfId: EntityId,
  selfArea: AreaId,
): EntityId | undefined {
  const [ai, selfMv] = ctx.world.get(selfId, NpcAi, Movement);
  if (!ai || !selfMv) {
    return undefined;
  }

  switch (ai.npcType) {
    case "aggressive":
      return findClosestCharacter(
        ctx,
        selfId,
        selfArea,
        selfMv.coords,
        ai.aggroRange,
      );
    case "defensive":
      return findClosestCharacter(
        ctx,
        selfId,
        selfArea,
        selfMv.coords,
        ai.aggroRange,
        (candidateId) => ctx.memory.hasAttacked(selfId, candidateId, selfId),
      );
    case "protective":
      return findProtectiveTarget(
        ctx,
        selfId,
        selfMv.coords,
        selfArea,
        ai.aggroRange,
      );
    default:
      return undefined;
  }
}

function findProtectiveTarget(
  ctx: AiCtx,
  selfId: EntityId,
  selfCoords: Vector<Tile>,
  selfArea: AreaId,
  aggroRange: number,
): EntityId | undefined {
  const selfTag = ctx.world.get(selfId, NpcTag);
  if (!selfTag) {
    return undefined;
  }

  const allies: ReadonlyArray<EntityId> =
    ctx.ralliesBySpawn.get(selfTag.spawnId) ?? [];

  let closest: EntityId | undefined;
  let closestDistSq = aggroRange * aggroRange;
  ctx.memory.forEachCombat(selfId, (attacker, target) => {
    const targetIsAlly = allies.includes(target);
    const attackerIsAlly = allies.includes(attacker);
    const enemyId = targetIsAlly
      ? attacker
      : attackerIsAlly
        ? target
        : undefined;
    if (enemyId === undefined || allies.includes(enemyId)) {
      return;
    }
    const [enemyMv, enemyArea, enemyCombat] = ctx.world.get(
      enemyId,
      Movement,
      AreaTag,
      Combat,
    );
    if (!enemyMv || !enemyArea || !enemyCombat || !enemyCombat.alive) {
      return;
    }
    if (enemyArea.areaId !== selfArea) {
      return;
    }
    const distSq = enemyMv.coords.squaredDistance(selfCoords);
    if (distSq <= closestDistSq) {
      closestDistSq = distSq;
      closest = enemyId;
    }
  });
  return closest;
}

function findClosestCharacter(
  ctx: AiCtx,
  selfId: EntityId,
  selfArea: AreaId,
  selfCoords: Vector<Tile>,
  aggroRange: number,
  filter?: (candidateId: EntityId) => boolean,
): EntityId | undefined {
  let closest: EntityId | undefined;
  let closestDistSq = aggroRange * aggroRange;
  for (const [candidateId, , candidateMv, candidateArea] of ctx.world.query(
    CharacterTag,
    Movement,
    AreaTag,
  )) {
    if (candidateId === selfId) {
      continue;
    }
    if (candidateArea.areaId !== selfArea) {
      continue;
    }
    const candidateCombat = ctx.world.get(candidateId, Combat);
    if (!candidateCombat || !candidateCombat.alive) {
      continue;
    }
    if (filter && !filter(candidateId)) {
      continue;
    }
    const distSq = candidateMv.coords.squaredDistance(selfCoords);
    if (distSq <= closestDistSq) {
      closestDistSq = distSq;
      closest = candidateId;
    }
  }
  return closest;
}

function pickFarthestPoint(
  from: Vector<Tile>,
  candidates: ReadonlyArray<Vector<Tile>>,
): Vector<Tile> {
  let bestDistSq = -1;
  let best = candidates[0];
  for (const c of candidates) {
    const ds = c.squaredDistance(from);
    if (ds > bestDistSq) {
      bestDistSq = ds;
      best = c;
    }
  }
  return best;
}
