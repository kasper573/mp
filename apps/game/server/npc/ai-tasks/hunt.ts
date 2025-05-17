import type { ActorId } from "../../traits/actor";
import type { Task, TaskInput } from "./Task";

export function createHuntTask(findNewEnemy: HuntFilter): Task {
  return function hunt(input) {
    const { npc, gameState } = input;

    if (npc.attackTargetId) {
      const target = gameState.actors()[npc.attackTargetId];
      if (npc.coords.distance(target.coords) >= npc.aggroRange) {
        // Target out of range, lose aggro
        gameState.actors.update(npc.id, (update) =>
          update
            .add("attackTargetId", undefined)
            .add("moveTarget", undefined)
            .add("path", undefined),
        );
      }
    } else {
      const newEnemyId = findNewEnemy(input);
      if (newEnemyId !== undefined) {
        gameState.actors.update(npc.id, (update) =>
          update.add("attackTargetId", newEnemyId),
        );
      }
    }

    return hunt;
  };
}

export type HuntFilter = (input: TaskInput) => ActorId | undefined;

export const defensiveHuntFilter: HuntFilter = ({ gameState, npc }) => {
  const target = gameState.actors
    .values()
    .find(
      (candidate) =>
        candidate.coords.distance(npc.coords) <= npc.aggroRange &&
        npc.hasBeenAttackedBy.includes(candidate.id),
    );
  return target?.id;
};

export const aggressiveHuntFilter: HuntFilter = ({ gameState, npc }) => {
  const target = gameState.actors
    .values()
    .find(
      (candidate) =>
        candidate.type === "character" &&
        candidate.coords.distance(npc.coords) <= npc.aggroRange,
    );
  return target?.id;
};

export const protectiveHuntFilter: HuntFilter = ({ gameState, npc }) => {
  const target = gameState.actors.values().find((candidate) => {
    if (candidate.coords.distance(npc.coords) > npc.aggroRange) {
      return false;
    }

    if (npc.hasBeenAttackedBy.includes(candidate.id)) {
      return true;
    }

    return false;
  });

  return target?.id;
};
