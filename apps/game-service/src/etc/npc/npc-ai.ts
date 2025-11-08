import type {
  ActorId,
  GameState,
  NpcInstance,
  NpcInstanceId,
} from "@mp/game-shared";
import { assert, type Rng } from "@mp/std";
import type { TickEvent } from "@mp/time";
import { TimeSpan, type TickEventHandler } from "@mp/time";
import type { GameStateServer } from "../game-state-server";
import type { NpcAiTaskContext, Task } from "./ai-tasks/task";
import { NpcAiCombatMemory } from "./npc-ai-combat-memory";

import type { AreaResource } from "@mp/game-shared";
import {
  aggressiveHuntFilter,
  createHuntTask,
  defensiveHuntFilter,
  protectiveHuntFilter,
} from "./ai-tasks/hunt";
import { createIdleTask } from "./ai-tasks/idle";
import { createPatrolTask } from "./ai-tasks/patrol";
import { createWanderTask } from "./ai-tasks/wander";

export class NpcAi {
  private npcTasks = new Map<NpcInstanceId, Task>();
  private combatMemories = new Map<ActorId, NpcAiCombatMemory>();

  constructor(
    private gameState: GameState,
    private gameStateServer: GameStateServer,
    private area: AreaResource,
    private rng: Rng,
  ) {}

  createTickHandler(): TickEventHandler {
    return (tick) => {
      const context: NpcAiTaskContext = {
        area: this.area,
        gameState: this.gameState,
        gameStateServer: this.gameStateServer,
        npcCombatMemories: this.combatMemories,
        tick,
        rng: this.rng,
      };

      for (const subject of this.gameState.actors.values()) {
        if (subject.type !== "npc" || !subject.combat.alive) {
          continue;
        }
        this.observeAttacksDoneThisTick(subject);

        const task =
          this.npcTasks.get(subject.identity.id) ??
          this.deriveTask(subject, tick);

        const nextTask = task(context, subject);
        this.npcTasks.set(subject.identity.id, nextTask);
      }

      this.removeExpiredCombats();
    };
  }

  private observeAttacksDoneThisTick(observer: NpcInstance) {
    for (const attack of this.gameStateServer.peekEvent("combat.attack")) {
      const canSeeCombatants = [attack.actorId, attack.targetId].some(
        (combatantId) => {
          const combatant = assert(this.gameState.actors.get(combatantId));
          return observer.movement.coords.isWithinDistance(
            combatant.movement.coords,
            observer.aggroRange,
          );
        },
      );

      if (canSeeCombatants) {
        let memory = this.combatMemories.get(observer.identity.id);
        if (!memory) {
          memory = new NpcAiCombatMemory();
          this.combatMemories.set(observer.identity.id, memory);
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
    switch (npc.identity.npcType) {
      case "static":
        return createIdleTask();
      case "patrol":
        if (!npc.patrol) {
          throw new Error(
            `NPC instance "${npc.identity.id}" of type "patrol" does not have a patrol path defined.`,
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
