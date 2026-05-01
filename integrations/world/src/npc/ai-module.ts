import type { Cleanup } from "@rift/module";
import type { EntityId, RiftServerEvent, World } from "@rift/core";
import { RiftServerModule, Tick } from "@rift/core";
import type { InferValue } from "@rift/types";
import type { Vector } from "@mp/math";
import { Rng, type Tile } from "@mp/std";
import type { AreaResource } from "../area/area-resource";
import type { AreaId } from "../identity/ids";
import { AreaTag } from "../area/components";
import { CharacterTag, NpcTag } from "../identity/components";
import { NpcAi } from "./components";
import { Combat } from "../combat/components";
import { Attacked } from "../combat/events";
import { Movement } from "../movement/components";

const PACIFIST_WANDER_CHANCE = 0.4;
const EMPTY_PATH: ReadonlyArray<Vector<Tile>> = [];
// While chasing an aggro target, NPCs move faster than their idle speed so
// that the actor sprite plays its run animation (which kicks in at
// speed >= 2 in actor-controller.ts). Restored to NpcAi.idleSpeed when the
// target is lost. Replaces the pre-migration ai-tasks/hunt.ts speed toggle.
const CHASE_SPEED_MULTIPLIER = 2;

export interface NpcAiOptions {
  readonly areas: ReadonlyMap<AreaId, AreaResource>;
  readonly rng?: Rng;
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

  clear(): void {
    this.#combats.clear();
  }
}

export class NpcAiModule extends RiftServerModule {
  readonly #areas: ReadonlyMap<AreaId, AreaResource>;
  readonly #memory = new CombatMemory();
  readonly #rng: Rng;

  constructor(opts: NpcAiOptions) {
    super();
    this.#areas = opts.areas;
    this.#rng = opts.rng ?? new Rng();
  }

  init(): Cleanup {
    const offTick = this.server.on(Tick, this.#onTick);
    const offAttacked = this.server.on(Attacked, this.#onAttacked);
    return () => {
      offTick();
      offAttacked();
      this.#memory.clear();
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
      const seesAttacker =
        attackerMv?.coords.isWithinDistance(observerMv.coords, ai.aggroRange) ??
        false;
      const seesTarget =
        targetMv?.coords.isWithinDistance(observerMv.coords, ai.aggroRange) ??
        false;
      if (seesAttacker || seesTarget) {
        this.#memory.observe(observerId, attacker, targetId);
      }
    }
  };

  #onTick = (): void => {
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
          path: EMPTY_PATH,
          moveTarget: undefined,
          speed: ai.idleSpeed,
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
        const refreshedMv = world.get(id, Movement);
        if (refreshedMv) {
          world.set(id, Movement, {
            ...refreshedMv,
            speed: (ai.idleSpeed * CHASE_SPEED_MULTIPLIER) as Tile,
          });
        }
        return;
      }
    }

    this.#applyIdleBehaviour(id, ai, mv, area);
  }

  #stillInRange(
    targetId: EntityId,
    selfCoords: Vector<Tile>,
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
    return targetMv.coords.isWithinDistance(selfCoords, aggroRange);
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
        path: EMPTY_PATH,
        moveTarget: undefined,
      });
    }
  }

  #applyIdleBehaviour(
    id: EntityId,
    ai: InferValue<typeof NpcAi>,
    mv: InferValue<typeof Movement>,
    area: AreaResource,
  ): void {
    if (mv.path.length > 0 || mv.moveTarget) return;

    switch (ai.npcType) {
      case "static":
        return;
      case "patrol":
        if (ai.patrol && ai.patrol.length > 0) {
          this.server.world.set(id, Movement, {
            ...mv,
            moveTarget: pickFarthestPoint(mv.coords, ai.patrol),
          });
        }
        return;
      case "pacifist":
        if (this.#rng.next() < PACIFIST_WANDER_CHANCE) {
          this.server.world.set(id, Movement, {
            ...mv,
            moveTarget: this.#pickRandomWalkable(area),
          });
        }
        return;
      case "aggressive":
      case "defensive":
      case "protective":
        // No target in sight — wander to a random walkable tile in hope of
        // running into one.
        this.server.world.set(id, Movement, {
          ...mv,
          moveTarget: this.#pickRandomWalkable(area),
        });
        return;
    }
  }

  #findAggroTarget(
    selfId: EntityId,
    ai: InferValue<typeof NpcAi>,
    selfMv: InferValue<typeof Movement>,
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
    selfMv: InferValue<typeof Movement>,
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
      const distSq = enemyMv.coords.squaredDistance(selfMv.coords);
      if (distSq <= closestDistSq) {
        closestDistSq = distSq;
        closest = enemyId;
      }
    }
    return closest;
  }

  #pickRandomWalkable(area: AreaResource): Vector<Tile> {
    const ids = Array.from(area.graph.nodeIds);
    if (ids.length === 0) {
      return area.start;
    }
    const node = area.graph.getNode(this.#rng.oneOf(ids));
    return node?.data.vector ?? area.start;
  }
}

function findClosestCharacter(
  world: World,
  selfId: EntityId,
  selfArea: AreaId,
  selfCoords: Vector<Tile>,
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
