import type { Cleanup } from "@rift/module";
import type { EntityId, RiftServerEvent, World } from "@rift/core";
import { RiftServerModule, Tick } from "@rift/core";
import type { InferValue } from "@rift/types";
import type { Tile } from "@mp/std";
import type { AreaResource } from "../area/area-resource";
import type { AreaId } from "../identity/ids";
import { AreaTag } from "../area/components";
import { CharacterTag, NpcTag } from "../identity/components";
import { NpcAi } from "./components";
import { Combat } from "../combat/components";
import { Attacked } from "../combat/events";
import { Movement } from "../movement/components";

export interface NpcAiOptions {
  readonly areas: ReadonlyMap<AreaId, AreaResource>;
}

/**
 * Records combat events between actors that an observer NPC has witnessed,
 * used by defensive/protective AI to decide whether to retaliate.
 */
class CombatMemory {
  readonly #combats = new Map<EntityId, Array<[EntityId, EntityId]>>();

  observe(observer: EntityId, attacker: EntityId, target: EntityId): void {
    let list = this.#combats.get(observer);
    if (!list) {
      list = [];
      this.#combats.set(observer, list);
    }
    list.push([attacker, target]);
  }

  combatsFor(observer: EntityId): ReadonlyArray<[EntityId, EntityId]> {
    return this.#combats.get(observer) ?? [];
  }

  hasAttackedEachOther(observer: EntityId, a: EntityId, b: EntityId): boolean {
    const list = this.#combats.get(observer);
    if (!list) return false;
    let aHitB = false;
    let bHitA = false;
    for (const [attacker, target] of list) {
      if (attacker === a && target === b) aHitB = true;
      if (attacker === b && target === a) bHitA = true;
      if (aHitB && bHitA) return true;
    }
    return false;
  }

  forget(deadActorId: EntityId): void {
    this.#combats.delete(deadActorId);
    for (const [observer, list] of this.#combats) {
      const filtered = list.filter(
        ([a, t]) => a !== deadActorId && t !== deadActorId,
      );
      if (filtered.length === 0) {
        this.#combats.delete(observer);
      } else if (filtered.length !== list.length) {
        this.#combats.set(observer, filtered);
      }
    }
  }
}

export class NpcAiModule extends RiftServerModule {
  readonly #areas: ReadonlyMap<AreaId, AreaResource>;
  readonly #memory = new CombatMemory();

  constructor(opts: NpcAiOptions) {
    super();
    this.#areas = opts.areas;
  }

  init(): Cleanup {
    const offTick = this.server.on(Tick, this.#onTick);
    const offAttacked = this.server.on(Attacked, this.#onAttacked);
    return () => {
      offTick();
      offAttacked();
    };
  }

  #onAttacked = (
    event: RiftServerEvent<{ entityId: EntityId; targetId: EntityId }>,
  ): void => {
    const { entityId: attacker, targetId } = event.data;
    const attackerMv = this.server.world.get(attacker, Movement);
    const targetMv = this.server.world.get(targetId, Movement);
    for (const [observerId, ai, observerMv] of this.server.world.query(
      NpcAi,
      Movement,
    )) {
      if (observerId === attacker) continue;
      const aggroRangeSq = ai.aggroRange * ai.aggroRange;
      const seesAttacker =
        attackerMv &&
        distanceSq(attackerMv.coords, observerMv.coords) <= aggroRangeSq;
      const seesTarget =
        targetMv &&
        distanceSq(targetMv.coords, observerMv.coords) <= aggroRangeSq;
      if (seesAttacker || seesTarget) {
        this.#memory.observe(observerId, attacker, targetId);
      }
    }
  };

  #onTick = (_event: RiftServerEvent<{ tick: number; dt: number }>): void => {
    const world = this.server.world;
    for (const [id, ai, mv, areaTag] of world.query(NpcAi, Movement, AreaTag)) {
      const area = this.#areas.get(areaTag.areaId);
      if (!area) continue;
      this.#stepNpc(id, ai, mv, areaTag.areaId, area);
    }
  };

  #stepNpc(
    id: EntityId,
    ai: InferValue<typeof NpcAi>,
    mv: InferValue<typeof Movement>,
    areaId: AreaId,
    area: AreaResource,
  ): void {
    const world = this.server.world;
    const combat = world.get(id, Combat);
    if (combat && !combat.alive) {
      this.#clearActions(id, combat, mv);
      this.#memory.forget(id);
      return;
    }

    if (combat?.attackTargetId !== undefined) {
      const stillEngaged = this.#stillInRange(
        combat.attackTargetId,
        mv.coords,
        areaId,
        ai.aggroRange,
      );
      if (!stillEngaged) {
        world.set(id, Combat, { ...combat, attackTargetId: undefined });
        world.set(id, Movement, {
          ...mv,
          path: [] as ReadonlyArray<{ x: Tile; y: Tile }>,
          moveTarget: undefined,
        });
      }
    }

    const refreshedCombat = world.get(id, Combat);
    if (refreshedCombat?.attackTargetId !== undefined) {
      // Already engaged; CombatModule handles attack + chase.
      return;
    }
    if (refreshedCombat) {
      const target = this.#findAggroTarget(id, ai, mv, areaId);
      if (target !== undefined) {
        world.set(id, Combat, { ...refreshedCombat, attackTargetId: target });
        return;
      }
    }

    this.#applyIdleBehaviour(id, ai, area);
  }

  #stillInRange(
    targetId: EntityId,
    selfCoords: { x: number; y: number },
    selfArea: AreaId,
    aggroRange: number,
  ): boolean {
    const world = this.server.world;
    const targetMv = world.get(targetId, Movement);
    const targetArea = world.get(targetId, AreaTag);
    const targetCombat = world.get(targetId, Combat);
    if (!targetMv || !targetArea || !targetCombat || !targetCombat.alive) {
      return false;
    }
    if (targetArea.areaId !== selfArea) return false;
    return distanceSq(targetMv.coords, selfCoords) <= aggroRange * aggroRange;
  }

  #clearActions(
    id: EntityId,
    combat: InferValue<typeof Combat>,
    mv: InferValue<typeof Movement>,
  ): void {
    const world = this.server.world;
    if (
      combat.attackTargetId !== undefined ||
      mv.moveTarget ||
      mv.path.length > 0
    ) {
      world.set(id, Combat, { ...combat, attackTargetId: undefined });
      world.set(id, Movement, {
        ...mv,
        path: [] as ReadonlyArray<{ x: Tile; y: Tile }>,
        moveTarget: undefined,
      });
    }
  }

  #applyIdleBehaviour(
    id: EntityId,
    ai: InferValue<typeof NpcAi>,
    area: AreaResource,
  ): void {
    const world = this.server.world;
    const refreshedMv = world.get(id, Movement);
    if (!refreshedMv) return;
    if (refreshedMv.path.length > 0 || refreshedMv.moveTarget) return;

    switch (ai.npcType) {
      case "static":
        return;
      case "patrol":
        if (ai.patrol && ai.patrol.length > 0) {
          const farthest = pickFarthestPoint(refreshedMv.coords, ai.patrol);
          world.set(id, Movement, { ...refreshedMv, moveTarget: farthest });
        }
        return;
      case "pacifist":
        if (Math.random() < 0.4) {
          world.set(id, Movement, {
            ...refreshedMv,
            moveTarget: pickRandomWalkable(area),
          });
        }
        return;
      case "aggressive":
      case "defensive":
      case "protective":
        // No target in sight — wander to a random walkable tile in hope of
        // running into one.
        world.set(id, Movement, {
          ...refreshedMv,
          moveTarget: pickRandomWalkable(area),
        });
        return;
    }
  }

  #findAggroTarget(
    selfId: EntityId,
    ai: { npcType: string; aggroRange: number },
    selfMv: { coords: { x: number; y: number } },
    selfArea: AreaId,
  ): EntityId | undefined {
    switch (ai.npcType) {
      case "aggressive":
        return findClosestCharacter(
          this.server.world,
          selfId,
          selfArea,
          selfMv.coords,
          ai.aggroRange,
        );
      case "defensive":
        return findClosestCharacter(
          this.server.world,
          selfId,
          selfArea,
          selfMv.coords,
          ai.aggroRange,
          (candidateId) =>
            this.#memory.hasAttackedEachOther(selfId, selfId, candidateId),
        );
      case "protective":
        return this.#findProtectiveTarget(
          selfId,
          selfMv,
          selfArea,
          ai.aggroRange,
        );
      default:
        return undefined;
    }
  }

  #findProtectiveTarget(
    selfId: EntityId,
    selfMv: { coords: { x: number; y: number } },
    selfArea: AreaId,
    aggroRange: number,
  ): EntityId | undefined {
    const world = this.server.world;
    const selfTag = world.get(selfId, NpcTag);
    if (!selfTag) return undefined;

    const allies = new Set<EntityId>();
    for (const [npcId, tag] of world.query(NpcTag)) {
      if (tag.spawnId === selfTag.spawnId) {
        allies.add(npcId);
      }
    }

    let closest: EntityId | undefined;
    let closestDistSq = aggroRange * aggroRange;
    for (const [attacker, target] of this.#memory.combatsFor(selfId)) {
      const enemyId = allies.has(target)
        ? attacker
        : allies.has(attacker)
          ? target
          : undefined;
      if (enemyId === undefined || allies.has(enemyId)) continue;
      const enemyMv = world.get(enemyId, Movement);
      const enemyArea = world.get(enemyId, AreaTag);
      const enemyCombat = world.get(enemyId, Combat);
      if (!enemyMv || !enemyArea || !enemyCombat || !enemyCombat.alive)
        continue;
      if (enemyArea.areaId !== selfArea) continue;
      const distSq = distanceSq(enemyMv.coords, selfMv.coords);
      if (distSq <= closestDistSq) {
        closestDistSq = distSq;
        closest = enemyId;
      }
    }
    return closest;
  }
}

function findClosestCharacter(
  world: World,
  selfId: EntityId,
  selfArea: AreaId,
  selfCoords: { x: number; y: number },
  aggroRange: number,
  filter?: (candidateId: EntityId) => boolean,
): EntityId | undefined {
  let closest: EntityId | undefined;
  let closestDistSq = aggroRange * aggroRange;
  for (const [candidateId, , candidateMv, candidateArea] of world.query(
    CharacterTag,
    Movement,
    AreaTag,
  )) {
    if (candidateId === selfId) continue;
    if (candidateArea.areaId !== selfArea) continue;
    const candidateCombat = world.get(candidateId, Combat);
    if (!candidateCombat || !candidateCombat.alive) continue;
    if (filter && !filter(candidateId)) continue;
    const distSq = distanceSq(candidateMv.coords, selfCoords);
    if (distSq <= closestDistSq) {
      closestDistSq = distSq;
      closest = candidateId;
    }
  }
  return closest;
}

function pickRandomWalkable(area: AreaResource): { x: Tile; y: Tile } {
  const ids = Array.from(area.graph.nodeIds);
  if (ids.length === 0) {
    return { x: area.start.x, y: area.start.y };
  }
  const node = area.graph.getNode(ids[Math.floor(Math.random() * ids.length)]);
  if (!node) {
    return { x: area.start.x, y: area.start.y };
  }
  return { x: node.data.vector.x, y: node.data.vector.y };
}

function pickFarthestPoint(
  from: { x: number; y: number },
  candidates: ReadonlyArray<{ x: Tile; y: Tile }>,
): { x: Tile; y: Tile } {
  let bestDistSq = -1;
  let best = candidates[0];
  for (const c of candidates) {
    const ds = distanceSq(c, from);
    if (ds > bestDistSq) {
      bestDistSq = ds;
      best = c;
    }
  }
  return best;
}

function distanceSq(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}
