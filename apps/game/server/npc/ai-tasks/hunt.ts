import type { Tile } from "@mp/std";
import { assert } from "@mp/std";
import type { ActorId } from "../../traits/actor";
import type { Task, TaskInput } from "./task";

export function createHuntTask(findNewEnemy: HuntFilter): Task {
  return function hunt(input) {
    const { npc, gameState, areas, rng } = input;

    if (npc.attackTargetId) {
      const target = gameState.actors()[npc.attackTargetId];
      if (npc.coords.distance(target.coords) > npc.aggroRange) {
        // Target out of range, lose aggro
        gameState.actors.update(npc.id, (update) =>
          update
            .add("attackTargetId", undefined)
            .add("moveTarget", undefined)
            .add("path", undefined)
            // TODO this is temporary until we have a buff/ability system
            .add("speed", 1 as Tile),
        );
      }
      return hunt;
    }

    const newEnemyId = findNewEnemy(input);
    if (newEnemyId !== undefined) {
      gameState.actors.update(npc.id, (update) =>
        update
          .add("attackTargetId", newEnemyId)
          // TODO this is temporary until we have a buff/ability system
          // The idea is that a hunter should cast a speed buff when detecting a new enemy
          .add("speed", 2 as Tile),
      );
      return hunt;
    }

    // If no enemy is in sight, walk to a random location and hope to run into an enemy
    if (!npc.path) {
      const area = assert(areas.get(npc.areaId));
      const toNode = rng.oneOf(area.graph.getNodes());
      gameState.actors.update(npc.id, (update) =>
        update
          .add("moveTarget", toNode.data.vector)
          // TODO this is temporary until we have a buff/ability system
          .add("speed", 1 as Tile),
      );
    }

    return hunt;
  };
}

export type HuntFilter = (input: TaskInput) => ActorId | undefined;

export const defensiveHuntFilter: HuntFilter = ({
  gameState,
  npc,
  npcCombatMemories,
}) => {
  const combatMemory = npcCombatMemories.get(npc.id);
  const target = gameState.actors
    .values()
    .find(
      (candidate) =>
        candidate.health > 0 &&
        candidate.coords.distance(npc.coords) <= npc.aggroRange &&
        combatMemory?.hasAttackedEachOther(candidate.id, npc.id),
    );
  return target?.id;
};

export const aggressiveHuntFilter: HuntFilter = ({ gameState, npc }) => {
  const target = gameState.actors
    .values()
    .find(
      (candidate) =>
        candidate.health > 0 &&
        candidate.type === "character" &&
        candidate.coords.distance(npc.coords) <= npc.aggroRange,
    );
  return target?.id;
};

export const protectiveHuntFilter: HuntFilter = ({
  gameState,
  npc,
  npcCombatMemories,
}) => {
  const combatMemory = npcCombatMemories.get(npc.id);

  // Consider other npcs of the same spawn allies
  const allyIds = new Set(
    gameState.actors
      .values()
      .filter(
        (actor) =>
          actor.id !== npc.id &&
          actor.type === "npc" &&
          actor.spawnId === npc.spawnId,
      )
      .map((actor) => actor.id),
  );

  // Actors attacking allies are considered enemies
  const enemyIds = new Set(
    combatMemory?.combats.flatMap(([actor1, actor2]) => {
      if (allyIds.has(actor1)) {
        return [actor2];
      } else if (allyIds.has(actor2)) {
        return [actor1];
      }
      return [];
    }),
  );

  const target = gameState.actors.values().find((candidate) => {
    if (
      candidate.health <= 0 ||
      candidate.coords.distance(npc.coords) > npc.aggroRange
    ) {
      return false;
    }

    return (
      combatMemory?.hasAttackedEachOther(candidate.id, npc.id) ||
      enemyIds.has(candidate.id)
    );
  });

  return target?.id;
};
