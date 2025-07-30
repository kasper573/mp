import type { ActorId, NpcInstance } from "@mp/game-shared";
import type { Tile } from "@mp/std";
import { assert } from "@mp/std";
import type { NpcAiTaskContext, Task } from "./task";

export function createHuntTask(findNewEnemy: HuntFilter): Task {
  return function hunt(context, npc) {
    const { gameState, gameStateServer, area, rng, npcCombatMemories } =
      context;

    const deadActorsThisTick = gameStateServer.peekEvent("actor.death");
    npcCombatMemories
      .get(npc.identity.id)
      ?.forgetCombatatants(deadActorsThisTick);

    if (npc.combat.attackTargetId) {
      const target = assert(gameState.actors.get(npc.combat.attackTargetId));
      if (
        !npc.movement.coords.isWithinDistance(
          target.movement.coords,
          npc.etc.aggroRange,
        )
      ) {
        // Target out of range, lose aggro
        npc.combat.attackTargetId = undefined;
        npc.movement.moveTarget = undefined;
        npc.movement.path = undefined;
        // TODO this is temporary until we have a buff/ability system
        npc.movement.speed = 1 as Tile;
      }
      return hunt;
    }

    const newEnemyId = findNewEnemy(context, npc);
    if (newEnemyId !== undefined) {
      npc.combat.attackTargetId = newEnemyId;
      // TODO this is temporary until we have a buff/ability system
      // The idea is that a hunter should cast a speed buff when detecting a new enemy
      npc.movement.speed = 2 as Tile;
      return hunt;
    }

    // If no enemy is in sight, walk to a random location and hope to run into an enemy
    if (!npc.movement.path) {
      const toNode = assert(area.graph.getNode(rng.oneOf(area.graph.nodeIds)));
      npc.movement.moveTarget = toNode.data.vector;
      // TODO this is temporary until we have a buff/ability system
      npc.movement.speed = 1 as Tile;
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
  const combatMemory = npcCombatMemories.get(npc.identity.id);
  const target = gameState.actors.index
    .access({ alive: true, type: "character" })
    .values()
    .find(function isDefensiveHuntTarget(candidate) {
      return (
        candidate.movement.coords.isWithinDistance(
          npc.movement.coords,
          npc.etc.aggroRange,
        ) &&
        combatMemory?.hasAttackedEachOther(
          candidate.identity.id,
          npc.identity.id,
        )
      );
    });
  return target?.identity.id;
};

export const aggressiveHuntFilter: HuntFilter = function aggressiveHuntFilter(
  { gameState },
  npc,
) {
  const target = gameState.actors.index
    .access({ alive: true, type: "character" })
    .values()
    .find(function isAggressiveHuntTarget(candidate) {
      return candidate.movement.coords.isWithinDistance(
        npc.movement.coords,
        npc.etc.aggroRange,
      );
    });
  return target?.identity.id;
};

export const protectiveHuntFilter: HuntFilter = function protectiveHuntFilter(
  { gameState, npcCombatMemories },
  npc,
) {
  const combatMemory = npcCombatMemories.get(npc.identity.id);

  const allies = gameState.actors.index.access({
    spawnId: npc.identity.spawnId,
  });

  // Actors attacking allies are considered enemies
  const enemyIds = combatMemory?.combats.reduce((acc, [actorId1, actorId2]) => {
    // oxlint-disable-next-line no-non-null-assertion
    if (allies.has(gameState.actors.get(actorId1)!)) {
      acc.add(actorId2);
      // oxlint-disable-next-line no-non-null-assertion
    } else if (allies.has(gameState.actors.get(actorId2)!)) {
      acc.add(actorId1);
    }
    return acc;
  }, new Set<ActorId>());

  const targetId = enemyIds?.values().find((enemyId) => {
    const candidate = assert(gameState.actors.get(enemyId));
    if (
      !candidate.movement.coords.isWithinDistance(
        npc.movement.coords,
        npc.etc.aggroRange,
      )
    ) {
      return false;
    }

    return (
      combatMemory?.hasAttackedEachOther(
        candidate.identity.id,
        npc.identity.id,
      ) || enemyIds.has(candidate.identity.id)
    );
  });

  return targetId;
};
