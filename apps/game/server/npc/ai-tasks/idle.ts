import type { TimeSpan } from "@mp/time";
import type { Task, TaskInput } from "./task";

export function createIdleTask(
  endTime?: TimeSpan,
  nextTask?: (input: TaskInput) => Task,
): Task {
  return function idle(input) {
    const { npc, tick } = input;
    if (endTime && tick.totalTimeElapsed.compareTo(endTime) > 0) {
      return nextTask ? nextTask(input) : idle;
    }
    if (npc.path || npc.moveTarget) {
      npc.path = undefined;
      npc.moveTarget = undefined;
    }
    return idle;
  };
}
