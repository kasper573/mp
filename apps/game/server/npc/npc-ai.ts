import type { TickEvent } from "@mp/time";
import { TimeSpan, type TickEventHandler } from "@mp/time";
import { assert, randomItem, recordValues } from "@mp/std";
import type { GameStateMachine } from "../game-state";
import type { AreaLookup } from "../area/lookup";
import type { NpcAggroType, NpcInstanceId } from "./schema";
import type { Task, TaskInput } from "./ai-tasks/Task";
import { createIdleTask } from "./ai-tasks/idle";
import { createWanderTask } from "./ai-tasks/wander";
import {
  aggressiveHuntFilter,
  createHuntTask,
  defensiveHuntFilter,
  protectiveHuntFilter,
} from "./ai-tasks/hunt";

export class NpcAi {
  private npcTasks = new Map<NpcInstanceId, Task[]>();
  constructor(
    private gameState: GameStateMachine,
    private areas: AreaLookup,
  ) {}

  createTickHandler(): TickEventHandler {
    return (tick) => {
      for (const subject of recordValues(this.gameState.actors())) {
        if (subject.type !== "npc") {
          continue;
        }
        const taskInput: TaskInput = {
          areas: this.areas,
          gameState: this.gameState,
          npc: subject,
          tick,
        };
        const tasks =
          this.npcTasks.get(subject.id) ?? deriveTasks(subject.aggroType, tick);
        const nextTasks = tasks.map((task) => task(taskInput));
        this.npcTasks.set(subject.id, nextTasks);
      }
    };
  }
}

function deriveTasks(aggroType: NpcAggroType, tick: TickEvent): Task[] {
  switch (aggroType) {
    case "pacifist":
      return [idleOrWander(tick)];
    case "aggressive":
      return [idleOrWander(tick), createHuntTask(aggressiveHuntFilter)];
    case "defensive":
      return [idleOrWander(tick), createHuntTask(defensiveHuntFilter)];
    case "protective":
      return [idleOrWander(tick), createHuntTask(protectiveHuntFilter)];
  }
}

function idleOrWander(tick: TickEvent): Task {
  const endTime = tick.totalTimeElapsed.add(TimeSpan.fromSeconds(5));
  return assert(
    randomItem([
      createIdleTask(endTime, (input) => idleOrWander(input.tick)),
      createWanderTask(endTime, (input) => idleOrWander(input.tick)),
    ]),
  );
}
