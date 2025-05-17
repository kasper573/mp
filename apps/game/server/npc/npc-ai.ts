import type { TickEventHandler } from "@mp/time";
import { TimeSpan } from "@mp/time";
import { randomItem, recordValues } from "@mp/std";
import type { ReadonlyDeep } from "@mp/sync";
import type { GameStateMachine } from "../game-state";
import type { AreaLookup } from "../area/lookup";
import { isTargetable } from "../traits/combat";
import type { NpcInstance, NpcInstanceId } from "./schema";

export class NpcAi {
  private aiStateLookup = new Map<NpcInstanceId, NpcAiState>();
  constructor(
    private gameState: GameStateMachine,
    private areas: AreaLookup,
  ) {}

  createTickHandler(): TickEventHandler {
    return ({ totalTimeElapsed }) => {
      for (const subject of recordValues(this.gameState.actors())) {
        if (subject.type !== "npc") {
          continue;
        }
        let aiState = this.aiStateLookup.get(subject.id);
        if (!aiState) {
          aiState = { task: newTask(totalTimeElapsed) };
          this.aiStateLookup.set(subject.id, aiState);
        }
        this.progressNpcAiState(subject, aiState, totalTimeElapsed);
      }
    };
  }

  private progressNpcAiState(
    subject: ReadonlyDeep<NpcInstance>,
    npcAiState: NpcAiState,
    totalTimeElapsed: TimeSpan,
  ): void {
    if (
      totalTimeElapsed.totalMilliseconds >=
      npcAiState.task.endTime.totalMilliseconds
    ) {
      npcAiState.task = newTask(totalTimeElapsed);
    }

    const { task } = npcAiState;

    switch (task.id) {
      case "fight":
        if (!subject.attackTargetId) {
          const others = Object.values(this.gameState.actors())
            .filter(
              (other) =>
                other.id !== subject.id && isTargetable(subject, other),
            )
            .map((other) => other.id);
          this.gameState.actors.update(subject.id, (u) =>
            u.add("attackTargetId", randomItem(others)),
          );
        }
        break;
      case "move": {
        if (!subject.path) {
          const area = this.areas.get(subject.areaId);
          if (!area) {
            throw new Error(`Area not found: ${subject.areaId}`);
          }

          const toNode = randomItem(Array.from(area.graph.getNodes()));
          if (toNode) {
            this.gameState.actors.update(subject.id, (update) =>
              update
                .add("moveTarget", toNode.data.vector)
                .add("attackTargetId", undefined),
            );
          }
        }
        break;
      }
    }
  }
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

interface NpcAiState {
  task: Task;
}
