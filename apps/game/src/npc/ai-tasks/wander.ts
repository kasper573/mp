import type { TimeSpan } from "@mp/time";
import type { Task } from "./task";
import { assert } from "@mp/std";

export function createWanderTask(endTime: TimeSpan, nextTask: Task): Task {
  return function wander(context, npc) {
    const { areas, tick, rng } = context;
    if (tick.totalTimeElapsed.compareTo(endTime) > 0) {
      return nextTask(context, npc);
    }

    if (!npc.movement.path) {
      const area = areas.get(npc.movement.areaId);
      if (!area) {
        throw new Error(`Area not found: ${npc.movement.areaId}`);
      }

      const toNode = assert(area.graph.getNode(rng.oneOf(area.graph.nodeIds)));
      npc.movement.moveTarget = toNode.data.vector;
      npc.combat.attackTargetId = undefined;
    }

    return wander;
  };
}
