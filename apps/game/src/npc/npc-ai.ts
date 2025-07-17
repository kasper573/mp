import type { TickEvent } from "@mp/time";
import { TimeSpan, type TickEventHandler } from "@mp/time";
import { assert, type Rng } from "@mp/std";
import type { GameState } from "../game-state/game-state";
import type { AreaLookup } from "../area/lookup";
import type { ActorId } from "../actor/actor";
import type { GameStateServer } from "../game-state/game-state-server";
import type { NpcInstance, NpcInstanceId } from "./types";
import type { Task, TaskInput } from "./ai-tasks/task";
import { NpcAiCombatMemory } from "./npc-ai-combat-memory";

import { createIdleTask } from "./ai-tasks/idle";
import {
  aggressiveHuntFilter,
  createHuntTask,
  defensiveHuntFilter,
  protectiveHuntFilter,
} from "./ai-tasks/hunt";
import { createWanderTask } from "./ai-tasks/wander";
import { createPatrolTask } from "./ai-tasks/patrol";

export class NpcAi {
  private npcTasks = new Map<NpcInstanceId, Task>();
  private combatMemories = new Map<ActorId, NpcAiCombatMemory>();

  constructor(
    private gameState: GameState,
    private gameStateServer: GameStateServer,
    private areas: AreaLookup,
    private rng: Rng,
  ) {}

  createTickHandler(): TickEventHandler {
    return (tick) => {
      for (const subject of this.gameState.actors.values()) {
        if (subject.type !== "npc" || subject.health <= 0) {
          continue;
        }

        this.observeAttacksDoneThisTick(subject);

        const taskInput: TaskInput = {
          areas: this.areas,
          gameState: this.gameState,
          gameStateServer: this.gameStateServer,
          npcCombatMemories: this.combatMemories,
          npc: subject,
          tick,
          rng: this.rng,
        };

        const task =
          this.npcTasks.get(subject.id) ?? this.deriveTask(subject, tick);

        const nextTask = task(taskInput);
        this.npcTasks.set(subject.id, nextTask);
      }

      this.removeExpiredCombats();
    };
  }

  private observeAttacksDoneThisTick(observer: NpcInstance) {
    for (const attack of this.gameStateServer.peekEvent("combat.attack")) {
      const canSeeCombatants = [attack.actorId, attack.targetId].some(
        (combatantId) => {
          const combatant = assert(this.gameState.actors.get(combatantId));
          return observer.coords.isWithinDistance(
            combatant.coords,
            observer.aggroRange,
          );
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
    const liveActorIds = new Set(Object.keys(this.gameState.actors));
    const memorizedActorIds = new Set(this.combatMemories.keys());
    const expiredActorIds = memorizedActorIds.difference(liveActorIds);
    for (const actorId of expiredActorIds) {
      this.combatMemories.delete(actorId);
    }
  }

  deriveTask = (npc: NpcInstance, tick: TickEvent): Task => {
    switch (npc.npcType) {
      case "static":
        return createIdleTask();
      case "patrol":
        if (!npc.patrol) {
          throw new Error(
            `NPC instance "${npc.id}" of type "patrol" does not have a patrol path defined.`,
          );
        }
        return createPatrolTask(npc.patrol);
      case "pacifist":
        return this.idleOrWander(tick);
      case "aggressive":
        return createHuntTask(aggressiveHuntFilter);
      case "defensive":
        return createHuntTask(defensiveHuntFilter);
      case "protective":
        return createHuntTask(protectiveHuntFilter);
    }
  };

  idleOrWander = (tick: TickEvent): Task => {
    const endTime = tick.totalTimeElapsed.add(TimeSpan.fromSeconds(5));
    return this.rng.oneOf([
      createIdleTask(endTime, (input) => this.idleOrWander(input.tick)),
      createWanderTask(endTime, (input) => this.idleOrWander(input.tick)),
    ]);
  };
}
