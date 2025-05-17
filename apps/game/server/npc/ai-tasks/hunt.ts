import type { ReadonlyDeep } from "@mp/sync";
import type { Actor, ActorId } from "../../traits/actor";
import type { NpcInstance } from "../schema";
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
  return gameState.actors
    .values()
    .find(
      (actor) =>
        actor.coords.distance(npc.coords) <= npc.aggroRange &&
        npc.hasBeenAttackedBy.includes(actor.id),
    )?.id;
};

export const aggressiveHuntFilter: HuntFilter = ({ gameState, npc }) => {
  return gameState.actors
    .values()
    .find(
      (actor) =>
        isEnemy(npc, actor) &&
        actor.coords.distance(npc.coords) <= npc.aggroRange,
    )?.id;
};

export const protectiveHuntFilter: HuntFilter = (input) => {
  return undefined;
};

function isEnemy(
  npc: ReadonlyDeep<NpcInstance>,
  target: ReadonlyDeep<Actor>,
): boolean {
  if (target.type === "character") {
    return true;
  }
  return false;
}
