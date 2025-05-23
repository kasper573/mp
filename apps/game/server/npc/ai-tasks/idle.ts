import type { TimeSpan } from "@mp/time";
import type { Task, TaskInput } from "./task";

export function createIdleTask(
  endTime?: TimeSpan,
  nextTask?: (input: TaskInput) => Task,
): Task {
  return function idle(input) {
    const { npc, gameState, tick } = input;
    if (endTime && tick.totalTimeElapsed.compareTo(endTime) > 0) {
      return nextTask ? nextTask(input) : idle;
    }
    if (npc.path || npc.moveTarget) {
      gameState.actors.update(npc.id, (update) => {
        update.add("path", undefined);
        update.add("moveTarget", undefined);
      });
    }
    return idle;
  };
}
