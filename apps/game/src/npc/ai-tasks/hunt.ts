import type { Tile } from "@mp/std";
import { assert } from "@mp/std";
import type { ActorId } from "../../actor/actor";
import type { NpcAiTaskContext, Task } from "./task";
import type { NpcInstance } from "../types";

export function createHuntTask(findNewEnemy: HuntFilter): Task {
  return function hunt(context, npc) {
    const { gameState, gameStateServer, areas, rng, npcCombatMemories } =
      context;

    const deadActorsThisTick = gameStateServer.peekEvent("actor.death");
    npcCombatMemories.get(npc.id)?.forgetCombatatants(deadActorsThisTick);

    if (npc.attackTargetId) {
      const target = assert(gameState.actors.get(npc.attackTargetId));
      if (!npc.coords.isWithinDistance(target.coords, npc.aggroRange)) {
        // Target out of range, lose aggro
        npc.attackTargetId = undefined;
        npc.moveTarget = undefined;
        npc.path = undefined;
        // TODO this is temporary until we have a buff/ability system
        npc.speed = 1 as Tile;
      }
      return hunt;
    }

    const newEnemyId = findNewEnemy(context, npc);
    if (newEnemyId !== undefined) {
      npc.attackTargetId = newEnemyId;
      // TODO this is temporary until we have a buff/ability system
      // The idea is that a hunter should cast a speed buff when detecting a new enemy
      npc.speed = 2 as Tile;
      return hunt;
    }

    // If no enemy is in sight, walk to a random location and hope to run into an enemy
    if (!npc.path) {
      const area = assert(areas.get(npc.areaId));
      const toNode = assert(area.graph.getNode(rng.oneOf(area.graph.nodeIds)));
      npc.moveTarget = toNode.data.vector;
      // TODO this is temporary until we have a buff/ability system
      npc.speed = 1 as Tile;
    }

    return hunt;
  };
}

type HuntFilter = (
  context: NpcAiTaskContext,
  npc: NpcInstance,
) => ActorId | undefined;

export const defensiveHuntFilter: HuntFilter = function defensiveHuntFilter(
  { gameState, npcCombatMemories },
  npc,
) {
  const combatMemory = npcCombatMemories.get(npc.id);
  const target = gameState.actors.index
    .access({ areaId: npc.areaId, alive: true, type: "character" })
    .values()
    .find(function isDefensiveHuntTarget(candidate) {
      return (
        candidate.coords.isWithinDistance(npc.coords, npc.aggroRange) &&
        combatMemory?.hasAttackedEachOther(candidate.id, npc.id)
      );
    });
  return target?.id;
};

export const aggressiveHuntFilter: HuntFilter = function aggressiveHuntFilter(
  { gameState },
  npc,
) {
  const target = gameState.actors.index
    .access({ areaId: npc.areaId, alive: true, type: "character" })
    .values()
    .find(function isAggressiveHuntTarget(candidate) {
      return candidate.coords.isWithinDistance(npc.coords, npc.aggroRange);
    });
  return target?.id;
};

export const protectiveHuntFilter: HuntFilter = function protectiveHuntFilter(
  { gameState, npcCombatMemories },
  npc,
) {
  const combatMemory = npcCombatMemories.get(npc.id);

  const allies = gameState.actors.index.access({
    areaId: npc.areaId,
    spawnId: npc.spawnId,
  });

  // Actors attacking allies are considered enemies
  const enemyIds = new Set(
    combatMemory?.combats.flatMap(function determineProtectiveHuntEnemyId([
      actorId1,
      actorId2,
    ]) {
      // oxlint-disable-next-line no-non-null-assertion
      if (allies.has(gameState.actors.get(actorId1)!)) {
        return [actorId2];
        // oxlint-disable-next-line no-non-null-assertion
      } else if (allies.has(gameState.actors.get(actorId2)!)) {
        return [actorId1];
      }
      return [];
    }),
  );

  const targetId = enemyIds
    .values()
    .find(function isProtectiveHuntTarget(enemyId) {
      const candidate = assert(gameState.actors.get(enemyId));
      if (!candidate.coords.isWithinDistance(npc.coords, npc.aggroRange)) {
        return false;
      }

      return (
        combatMemory?.hasAttackedEachOther(candidate.id, npc.id) ||
        enemyIds.has(candidate.id)
      );
    });

  return targetId;
};
