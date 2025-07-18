import type { TimeSpan } from "@mp/time";
import type { Task } from "./task";
import { assert } from "@mp/std";

export function createWanderTask(endTime: TimeSpan, nextTask: Task): Task {
  return function wander(context, npc) {
    const { areas, tick, rng } = context;
    if (tick.totalTimeElapsed.compareTo(endTime) > 0) {
      return nextTask(context, npc);
    }

    if (!npc.path) {
      const area = areas.get(npc.areaId);
      if (!area) {
        throw new Error(`Area not found: ${npc.areaId}`);
      }

      const toNode = assert(area.graph.getNode(rng.oneOf(area.graph.nodeIds)));
      npc.moveTarget = toNode.data.vector;
      npc.attackTargetId = undefined;
    }

    return wander;
  };
}
