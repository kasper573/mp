import type { PatchStateMachine } from "@mp/sync/server";
import type { TickEventHandler } from "@mp/time";
import { TimeSpan } from "@mp/time";
import { randomItem, recordValues } from "@mp/std";
import type { GameState } from "../game-state";
import type { AreaLookup } from "../area/load-areas";
import { isTargetable } from "../traits/combat";
import type { NPCInstanceId } from "./schema";

export function npcAIBehavior(
  state: PatchStateMachine<GameState>,
  areas: AreaLookup,
): TickEventHandler {
  const tasks = new Map<NPCInstanceId, Task>();
  return ({ totalTimeElapsed }) => {
    for (const subject of recordValues(state.actors())) {
      if (subject.type !== "npc") {
        continue;
      }

      let task = tasks.get(subject.id);
      if (
        !task ||
        totalTimeElapsed.totalMilliseconds >= task.endTime.totalMilliseconds
      ) {
        task = newTask(totalTimeElapsed);
        tasks.set(subject.id, task);
      }

      switch (task.id) {
        case "fight":
          if (!subject.attackTargetId) {
            const others = Object.values(state.actors())
              .filter(
                (other) =>
                  other.id !== subject.id && isTargetable(subject, other),
              )
              .map((other) => other.id);
            state.actors.update(subject.id, {
              attackTargetId: randomItem(others),
            });
          }
          break;
        case "move": {
          if (!subject.path) {
            const area = areas.get(subject.areaId);
            if (!area) {
              throw new Error(`Area not found: ${subject.areaId}`);
            }

            const toNode = randomItem(Array.from(area.graph.getNodes()));
            if (toNode) {
              state.actors.update(subject.id, {
                moveTarget: toNode.data.vector,
                attackTargetId: undefined,
              });
            }
          }
          break;
        }
      }
    }
  };
}

function newTask(currentTime: TimeSpan): Task {
  return {
    id: randomItem(taskIds) as TaskId,
    endTime: currentTime.add(TimeSpan.fromSeconds(15)),
  };
}

const taskIds = ["fight", "move"] as const;

type TaskId = (typeof taskIds)[number];

interface Task {
  id: TaskId;
  endTime: TimeSpan;
}
