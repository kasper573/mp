import type { TickEvent } from "@mp/time";
import { TimeSpan, type TickEventHandler } from "@mp/time";
import { assert, randomItem } from "@mp/std";
import type { ReadonlyDeep } from "@mp/sync";
import type { GameStateMachine } from "../game-state";
import type { AreaLookup } from "../area/lookup";
import type { ActorId } from "../traits/actor";
import type { NpcAggroType, NpcInstance, NpcInstanceId } from "./schema";
import { type Task, type TaskInput } from "./ai-tasks/task";
import { NpcAiCombatMemory } from "./npc-ai-combat-memory";

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
  private combatMemories = new Map<ActorId, NpcAiCombatMemory>();

  constructor(
    private gameState: GameStateMachine,
    private areas: AreaLookup,
  ) {}

  createTickHandler(): TickEventHandler {
    let nextMemoryCleanupTime = TimeSpan.Zero;
    return (tick) => {
      for (const subject of this.gameState.actors.values()) {
        if (subject.type !== "npc") {
          continue;
        }

        this.observeAttacksDoneThisTick(subject);

        const taskInput: TaskInput = {
          areas: this.areas,
          gameState: this.gameState,
          npcCombatMemories: this.combatMemories,
          npc: subject,
          tick,
        };
        const tasks =
          this.npcTasks.get(subject.id) ?? deriveTasks(subject.aggroType, tick);
        const nextTasks = tasks.map((task) => task(taskInput));
        this.npcTasks.set(subject.id, nextTasks);
      }

      // Since npc instances come and go frequently and in large quantities we need to clean up this map to avoid memory leaks,
      // but it's not important that it's always up to date so we can do it on an interval.
      if (tick.totalTimeElapsed.compareTo(nextMemoryCleanupTime) > 0) {
        this.removeExpiredCombats();
        nextMemoryCleanupTime = tick.totalTimeElapsed.add(
          TimeSpan.fromMinutes(1),
        );
      }
    };
  }

  private observeAttacksDoneThisTick(observer: ReadonlyDeep<NpcInstance>) {
    for (const attack of this.gameState.$event.peek("combat.attack")) {
      const canSeeCombatants = [attack.actorId, attack.targetId].some(
        (combatantId) => {
          const combatant = this.gameState.actors()[combatantId];
          const distance = observer.coords.distance(combatant.coords);
          return distance <= observer.aggroRange;
        },
      );

      if (canSeeCombatants) {
        let memory = this.combatMemories.get(observer.id);
        if (!memory) {
          memory = new NpcAiCombatMemory();
          this.combatMemories.set(observer.id, memory);
        }
        memory.observeAttack(attack.actorId, attack.targetId);
      }
    }
  }

  private removeExpiredCombats() {
    const liveActorIds = new Set(this.gameState.actors.keys());
    const memorizedActorIds = new Set(this.combatMemories.keys());
    const expiredActorIds = memorizedActorIds.difference(liveActorIds);
    for (const actorId of expiredActorIds) {
      this.combatMemories.delete(actorId);
    }
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
