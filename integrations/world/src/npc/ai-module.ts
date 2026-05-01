import type { Cleanup } from "@rift/module";
import type { EntityId, RiftServerEvent, World } from "@rift/core";
import { RiftServerModule, Tick } from "@rift/core";
import type { Tile } from "@mp/std";
import type { AreaResource } from "../area/area-resource";
import type { AreaId } from "../identity/ids";
import { AreaTag } from "../area/components";
import { CharacterTag } from "../identity/components";
import { NpcAi } from "./components";
import { Combat } from "../combat/components";
import { Movement } from "../movement/components";

export interface NpcAiOptions {
  readonly areas: ReadonlyMap<AreaId, AreaResource>;
}

export class NpcAiModule extends RiftServerModule {
  readonly #areas: ReadonlyMap<AreaId, AreaResource>;

  constructor(opts: NpcAiOptions) {
    super();
    this.#areas = opts.areas;
  }

  init(): Cleanup {
    return this.server.on(Tick, this.#onTick);
  }

  #onTick = (_event: RiftServerEvent<{ tick: number; dt: number }>): void => {
    const world = this.server.world;
    for (const [id, ai, mv, areaTag] of world.query(NpcAi, Movement, AreaTag)) {
      const combat = world.get(id, Combat);
      if (combat && !combat.alive) continue;
      const area = this.#areas.get(areaTag.areaId);
      if (!area) continue;

      // Aggressive and protective NPCs proactively engage nearby characters.
      // (Defensive NPCs only retaliate when attacked, which CombatModule
      // handles via attackTargetId without our help.)
      if (
        combat &&
        combat.attackTargetId === undefined &&
        (ai.npcType === "aggressive" || ai.npcType === "protective")
      ) {
        const target = findAggroTarget(
          world,
          id,
          areaTag.areaId,
          mv.coords,
          ai.aggroRange,
        );
        if (target !== undefined) {
          world.set(id, Combat, { ...combat, attackTargetId: target });
          continue;
        }
      }

      if (mv.moveTarget || mv.path.length > 0) continue;
      if (ai.npcType === "static" || ai.npcType === "patrol") continue;
      const wanderTarget = pickWanderTarget(mv.coords);
      if (wanderTarget) {
        world.set(id, Movement, { ...mv, moveTarget: wanderTarget });
      }
    }
  };
}

function findAggroTarget(
  world: World,
  selfId: EntityId,
  selfArea: AreaId,
  selfCoords: { x: number; y: number },
  aggroRange: number,
): EntityId | undefined {
  let closest: EntityId | undefined;
  let closestDistanceSq = aggroRange * aggroRange;
  for (const [candidateId, , candidateMv, candidateArea] of world.query(
    CharacterTag,
    Movement,
    AreaTag,
  )) {
    if (candidateId === selfId) continue;
    if (candidateArea.areaId !== selfArea) continue;
    const candidateCombat = world.get(candidateId, Combat);
    if (!candidateCombat || !candidateCombat.alive) continue;
    const dx = candidateMv.coords.x - selfCoords.x;
    const dy = candidateMv.coords.y - selfCoords.y;
    const distanceSq = dx * dx + dy * dy;
    if (distanceSq < closestDistanceSq) {
      closestDistanceSq = distanceSq;
      closest = candidateId;
    }
  }
  return closest;
}

function pickWanderTarget(current: {
  x: number;
  y: number;
}): { x: Tile; y: Tile } | undefined {
  const radius = 5;
  const dx = (Math.random() * 2 - 1) * radius;
  const dy = (Math.random() * 2 - 1) * radius;
  return {
    x: (current.x + dx) as Tile,
    y: (current.y + dy) as Tile,
  };
}
