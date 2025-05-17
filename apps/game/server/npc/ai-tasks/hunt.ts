import type { ReadonlyDeep } from "@mp/sync";
import type { Actor } from "../../traits/actor";
import type { NpcInstance } from "../schema";
import type { Task } from "./Task";

export function createHuntTask(): Task {
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
      // Npc has no target, hunt for a new enemy
      const firstEnemyInRange = gameState.actors
        .values()
        .find(
          (actor) =>
            isEnemy(npc, actor) &&
            actor.coords.distance(npc.coords) <= npc.aggroRange,
        );

      if (firstEnemyInRange) {
        // New target found
        gameState.actors.update(npc.id, (update) =>
          update.add("attackTargetId", firstEnemyInRange.id),
        );
      }
    }

    return hunt;
  };
}

function isEnemy(
  npc: ReadonlyDeep<NpcInstance>,
  target: ReadonlyDeep<Actor>,
): boolean {
  if (target.type === "character") {
    return true;
  }
  return false;
}
