import type { TimeSpan } from "@mp/time";
import type { Task, TaskInput } from "./task";

export function createIdleTask(
  endTime: TimeSpan,
  nextTask: (input: TaskInput) => Task,
): Task {
  return function idle(input) {
    if (input.tick.totalTimeElapsed.compareTo(endTime) > 0) {
      return nextTask(input);
    }
    return idle;
  };
}
