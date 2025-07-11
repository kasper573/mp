import type { TimeSpan } from "@mp/time";
import type { Task, TaskInput } from "./task";

export function createWanderTask(
  endTime: TimeSpan,
  nextTask: (input: TaskInput) => Task,
): Task {
  return function wander(input) {
    const { areas, npc, tick, rng } = input;
    if (tick.totalTimeElapsed.compareTo(endTime) > 0) {
      return nextTask(input);
    }

    if (!npc.path) {
      const area = areas.get(npc.areaId);
      if (!area) {
        throw new Error(`Area not found: ${npc.areaId}`);
      }

      const toNode = rng.oneOf(area.graph.getNodes());
      npc.moveTarget = toNode.data.vector;
      npc.attackTargetId = undefined;
    }

    return wander;
  };
}
