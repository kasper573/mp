import type { Cleanup, Feature } from "@rift/feature";
import { Tick, type EntityId, type World } from "@rift/core";
import type { InferValue } from "@rift/types";
import type { Vector } from "@mp/math";
import { combine, Rng, type Tile } from "@mp/std";
import type { AreaResource } from "../area/area-resource";
import type { AreaId, NpcSpawnId } from "../identity/ids";
import { AreaTag } from "../area/components";
import { CharacterTag, NpcTag } from "../identity/components";
import { NpcAi } from "./components";
import { Combat } from "../combat/components";
import { Attacked } from "../combat/events";
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
    if (!attackers) return;
    attackers.forEach((targets, attacker) => {
      targets.forEach((target) => visit(attacker, target));
    });
  }

  hasAttackedEachOther(observer: EntityId, a: EntityId, b: EntityId): boolean {
    const attackers = this.#combats.get(observer);
    if (!attackers) return false;
    const aTargets = attackers.get(a);
    if (!aTargets || !aTargets.has(b)) return false;
    const bTargets = attackers.get(b);
    return bTargets?.has(a) ?? false;
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
            if (node) list.push(node.data.vector);
          }
          nodes = list;
          walkableNodesByArea.set(area, nodes);
        }
        if (nodes.length === 0) return area.start;
        return rng.oneOf(nodes);
      }

      return combine(
        server.on(Attacked, (event) => {
          const { entityId: attacker, targetId } = event.data;
          const attackerMv = server.world.get(attacker, Movement);
          const targetMv = server.world.get(targetId, Movement);
          for (const [observerId, ai, observerMv] of server.world.query(
            NpcAi,
            Movement,
          )) {
            if (observerId === attacker) continue;
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
          const ralliesBySpawn = buildAllyIndex(server.world);
          for (const [id, ai, mv, areaTag, combat] of server.world.query(
            NpcAi,
            Movement,
            AreaTag,
            Combat,
          )) {
            const area = opts.areas.get(areaTag.areaId);
            if (!area) continue;
            stepNpc(
              server.world,
              memory,
              ralliesBySpawn,
              pickRandomWalkable,
              rng,
              id,
              ai,
              mv,
              areaTag.areaId,
              area,
              combat,
            );
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

function stepNpc(
  world: World,
  memory: CombatMemory,
  ralliesBySpawn: Map<NpcSpawnId, EntityId[]>,
  pickRandomWalkable: (area: AreaResource) => Vector<Tile>,
  rng: Rng,
  id: EntityId,
  ai: InferValue<typeof NpcAi>,
  mv: InferValue<typeof Movement>,
  areaId: AreaId,
  area: AreaResource,
  combat: InferValue<typeof Combat>,
): void {
  if (!combat.alive) {
    clearActions(world, id, combat, mv);
    memory.forget(id);
    return;
  }

  if (combat.attackTargetId !== undefined) {
    const stillEngaged = stillInRange(
      world,
      combat.attackTargetId,
      mv.coords,
      areaId,
      ai.aggroRange,
    );
    if (!stillEngaged) {
      world.remove(id, PathFollow);
      world.write(id, Combat, { attackTargetId: undefined });
      world.write(id, Movement, {
        moveTarget: undefined,
        speed: ai.idleSpeed,
      });
    }
  }

  if (combat.attackTargetId !== undefined) return;

  const target = findAggroTarget(
    world,
    memory,
    ralliesBySpawn,
    id,
    ai,
    mv,
    areaId,
  );
  if (target !== undefined) {
    world.write(id, Combat, { attackTargetId: target });
    world.write(id, Movement, {
      speed: (ai.idleSpeed * CHASE_SPEED_MULTIPLIER) as Tile,
    });
    return;
  }

  applyIdleBehaviour(world, pickRandomWalkable, rng, id, ai, mv, area);
}

function stillInRange(
  world: World,
  targetId: EntityId,
  selfCoords: Vector<Tile>,
  selfArea: AreaId,
  aggroRange: number,
): boolean {
  const targetMv = world.get(targetId, Movement);
  const targetArea = world.get(targetId, AreaTag);
  const targetCombat = world.get(targetId, Combat);
  if (!targetMv || !targetArea || !targetCombat || !targetCombat.alive) {
    return false;
  }
  if (targetArea.areaId !== selfArea) return false;
  return targetMv.coords.isWithinDistance(selfCoords, aggroRange);
}

function clearActions(
  world: World,
  id: EntityId,
  combat: InferValue<typeof Combat>,
  mv: InferValue<typeof Movement>,
): void {
  const hadPath = world.has(id, PathFollow);
  if (combat.attackTargetId !== undefined || mv.moveTarget || hadPath) {
    world.remove(id, PathFollow);
    world.write(id, Combat, { attackTargetId: undefined });
    world.write(id, Movement, { moveTarget: undefined });
  }
}

function applyIdleBehaviour(
  world: World,
  pickRandomWalkable: (area: AreaResource) => Vector<Tile>,
  rng: Rng,
  id: EntityId,
  ai: InferValue<typeof NpcAi>,
  mv: InferValue<typeof Movement>,
  area: AreaResource,
): void {
  if (mv.moveTarget || world.has(id, PathFollow)) return;

  switch (ai.npcType) {
    case "static":
      return;
    case "patrol":
      if (ai.patrol && ai.patrol.length > 0) {
        world.write(id, Movement, {
          moveTarget: pickFarthestPoint(mv.coords, ai.patrol),
        });
      }
      return;
    case "pacifist":
      if (rng.next() < PACIFIST_WANDER_CHANCE) {
        world.write(id, Movement, { moveTarget: pickRandomWalkable(area) });
      }
      return;
    case "aggressive":
    case "defensive":
    case "protective":
      world.write(id, Movement, { moveTarget: pickRandomWalkable(area) });
      return;
  }
}

function findAggroTarget(
  world: World,
  memory: CombatMemory,
  ralliesBySpawn: Map<NpcSpawnId, EntityId[]>,
  selfId: EntityId,
  ai: InferValue<typeof NpcAi>,
  selfMv: InferValue<typeof Movement>,
  selfArea: AreaId,
): EntityId | undefined {
  switch (ai.npcType) {
    case "aggressive":
      return findClosestCharacter(
        world,
        selfId,
        selfArea,
        selfMv.coords,
        ai.aggroRange,
      );
    case "defensive":
      return findClosestCharacter(
        world,
        selfId,
        selfArea,
        selfMv.coords,
        ai.aggroRange,
        (candidateId) =>
          memory.hasAttackedEachOther(selfId, selfId, candidateId),
      );
    case "protective":
      return findProtectiveTarget(
        world,
        memory,
        ralliesBySpawn,
        selfId,
        selfMv,
        selfArea,
        ai.aggroRange,
      );
    default:
      return undefined;
  }
}

function findProtectiveTarget(
  world: World,
  memory: CombatMemory,
  ralliesBySpawn: Map<NpcSpawnId, EntityId[]>,
  selfId: EntityId,
  selfMv: InferValue<typeof Movement>,
  selfArea: AreaId,
  aggroRange: number,
): EntityId | undefined {
  const selfTag = world.get(selfId, NpcTag);
  if (!selfTag) return undefined;

  const allyList = ralliesBySpawn.get(selfTag.spawnId);
  const allies =
    allyList && allyList.length > 0 ? new Set(allyList) : new Set<EntityId>();

  let closest: EntityId | undefined;
  let closestDistSq = aggroRange * aggroRange;
  memory.forEachCombat(selfId, (attacker, target) => {
    const enemyId = allies.has(target)
      ? attacker
      : allies.has(attacker)
        ? target
        : undefined;
    if (enemyId === undefined || allies.has(enemyId)) return;
    const enemyMv = world.get(enemyId, Movement);
    const enemyArea = world.get(enemyId, AreaTag);
    const enemyCombat = world.get(enemyId, Combat);
    if (!enemyMv || !enemyArea || !enemyCombat || !enemyCombat.alive) return;
    if (enemyArea.areaId !== selfArea) return;
    const distSq = enemyMv.coords.squaredDistance(selfMv.coords);
    if (distSq <= closestDistSq) {
      closestDistSq = distSq;
      closest = enemyId;
    }
  });
  return closest;
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
