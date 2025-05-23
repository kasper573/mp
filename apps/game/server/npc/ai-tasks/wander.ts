import { randomItem } from "@mp/std";
import type { TimeSpan } from "@mp/time";
import type { Task, TaskInput } from "./task";

export function createWanderTask(
  endTime: TimeSpan,
  nextTask: (input: TaskInput) => Task,
): Task {
  return function wander(input) {
    const { areas, gameState, npc, tick, rng } = input;
    if (tick.totalTimeElapsed.compareTo(endTime) > 0) {
      return nextTask(input);
    }

    if (!npc.path) {
      const area = areas.get(npc.areaId);
      if (!area) {
        throw new Error(`Area not found: ${npc.areaId}`);
      }

      const toNode = randomItem(Array.from(area.graph.getNodes()), rng);
      if (toNode) {
        gameState.actors.update(npc.id, (update) =>
          update
            .add("moveTarget", toNode.data.vector)
            .add("attackTargetId", undefined),
        );
      }
    }

    return wander;
  };
}
