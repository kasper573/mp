import type { TimeSpan } from "@mp/time";
import type { Task } from "./task";

export function createIdleTask(endTime?: TimeSpan, nextTask?: Task): Task {
  return function idle(context, npc) {
    if (endTime && context.tick.totalTimeElapsed.compareTo(endTime) > 0) {
      return nextTask ? nextTask(context, npc) : idle;
    }
    if (npc.path || npc.moveTarget) {
      npc.path = undefined;
      npc.moveTarget = undefined;
    }
    return idle;
  };
}
