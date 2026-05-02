import type { Cleanup } from "@rift/module";
import type { EntityId, inferServerEvent, World } from "@rift/core";
import { RiftServerModule, Tick } from "@rift/core";
import type { InferValue } from "@rift/types";
import type { Vector } from "@mp/math";
import { combine, Rng, type Tile } from "@mp/std";
import { inject } from "@rift/module";
import { MovementModule } from "../movement/module";
import type { AreaResource } from "../area/area-resource";
import type { AreaId, NpcSpawnId } from "../identity/ids";
import { AreaTag } from "../area/components";
import { CharacterTag, NpcTag } from "../identity/components";
import { NpcAi } from "./components";
import { Combat } from "../combat/components";
import { Attacked } from "../combat/events";
import { Movement } from "../movement/components";

const PACIFIST_WANDER_CHANCE = 0.4;
// Speed >= 2 triggers the run animation in actor-controller.ts.
const CHASE_SPEED_MULTIPLIER = 2;

export interface NpcAiOptions {
  readonly areas: ReadonlyMap<AreaId, AreaResource>;
  readonly rng?: Rng;
}

class CombatMemory {
  // observer → attacker → set of targets the observer has seen attacker hit.
  // Keeps every observation O(1) for both writes and the symmetric
  // hasAttackedEachOther read used by defensive aggro filters.
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

export class NpcAiModule extends RiftServerModule {
  @inject(MovementModule) accessor movement!: MovementModule;

  readonly #areas: ReadonlyMap<AreaId, AreaResource>;
  readonly #memory = new CombatMemory();
  readonly #rng: Rng;

  constructor(opts: NpcAiOptions) {
    super();
    this.#areas = opts.areas;
    this.#rng = opts.rng ?? new Rng();
  }

  init(): Cleanup {
    return combine(
      this.server.on(Tick, this.#onTick),
      this.server.on(Attacked, this.#onAttacked),
      () => this.#memory.clear(),
    );
  }

  #onAttacked = (event: inferServerEvent<typeof Attacked>): void => {
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

  #ralliesBySpawn?: Map<NpcSpawnId, EntityId[]>;

  #buildAllyIndex(): Map<NpcSpawnId, EntityId[]> {
    const out = new Map<NpcSpawnId, EntityId[]>();
    for (const [id, tag] of this.server.world.query(NpcTag)) {
      let bucket = out.get(tag.spawnId);
      if (!bucket) {
        bucket = [];
        out.set(tag.spawnId, bucket);
      }
      bucket.push(id);
    }
    return out;
  }

  #onTick = (): void => {
    const world = this.server.world;
    this.#ralliesBySpawn = this.#buildAllyIndex();
    for (const [id, ai, mv, areaTag, combat] of world.query(
      NpcAi,
      Movement,
      AreaTag,
      Combat,
    )) {
      const area = this.#areas.get(areaTag.areaId);
      if (!area) continue;
      this.#stepNpc(id, ai, mv, areaTag.areaId, area, combat);
    }
  };

  #stepNpc(
    id: EntityId,
    ai: InferValue<typeof NpcAi>,
    mv: InferValue<typeof Movement>,
    areaId: AreaId,
    area: AreaResource,
    combat: InferValue<typeof Combat>,
  ): void {
    const world = this.server.world;
    if (!combat.alive) {
      this.#clearActions(id, combat, mv);
      this.#memory.forget(id);
      return;
    }

    if (combat.attackTargetId !== undefined) {
      const stillEngaged = this.#stillInRange(
        combat.attackTargetId,
        mv.coords,
        areaId,
        ai.aggroRange,
      );
      if (!stillEngaged) {
        this.movement.setPath(id, undefined);
        world.set(id, Combat, { ...combat, attackTargetId: undefined });
        world.set(id, Movement, {
          ...mv,
          moveTarget: undefined,
          speed: ai.idleSpeed,
        });
      }
    }

    if (combat.attackTargetId !== undefined) return;

    const target = this.#findAggroTarget(id, ai, mv, areaId);
    if (target !== undefined) {
      world.set(id, Combat, { ...combat, attackTargetId: target });
      world.set(id, Movement, {
        ...mv,
        speed: (ai.idleSpeed * CHASE_SPEED_MULTIPLIER) as Tile,
      });
      return;
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
    const hadPath = this.movement.hasPath(id);
    if (combat.attackTargetId !== undefined || mv.moveTarget || hadPath) {
      this.movement.setPath(id, undefined);
      world.set(id, Combat, { ...combat, attackTargetId: undefined });
      world.set(id, Movement, { ...mv, moveTarget: undefined });
    }
  }

  #applyIdleBehaviour(
    id: EntityId,
    ai: InferValue<typeof NpcAi>,
    mv: InferValue<typeof Movement>,
    area: AreaResource,
  ): void {
    if (mv.moveTarget || this.movement.hasPath(id)) return;

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

    const allyList = this.#ralliesBySpawn?.get(selfTag.spawnId);
    const allies =
      allyList && allyList.length > 0 ? new Set(allyList) : new Set<EntityId>();

    let closest: EntityId | undefined;
    let closestDistSq = aggroRange * aggroRange;
    this.#memory.forEachCombat(selfId, (attacker, target) => {
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

  readonly #walkableNodesByArea = new WeakMap<
    AreaResource,
    ReadonlyArray<Vector<Tile>>
  >();

  #pickRandomWalkable(area: AreaResource): Vector<Tile> {
    let nodes = this.#walkableNodesByArea.get(area);
    if (!nodes) {
      const list: Vector<Tile>[] = [];
      for (const id of area.graph.nodeIds) {
        const node = area.graph.getNode(id);
        if (node) list.push(node.data.vector);
      }
      nodes = list;
      this.#walkableNodesByArea.set(area, nodes);
    }
    if (nodes.length === 0) return area.start;
    return this.#rng.oneOf(nodes);
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
