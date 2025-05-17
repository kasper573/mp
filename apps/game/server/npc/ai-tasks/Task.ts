import type { ReadonlyDeep } from "@mp/sync";
import type { TickEvent } from "@mp/time";
import type { AreaLookup } from "../../area/lookup";
import type { GameStateMachine } from "../../game-state";
import type { NpcInstance } from "../schema";
import type { ActorId } from "../../traits/actor";
import type { NpcAiCombatMemory } from "../npc-ai-combat-memory";

export interface TaskInput {
  gameState: GameStateMachine;
  areas: AreaLookup;
  npc: ReadonlyDeep<NpcInstance>;
  tick: TickEvent;
  combatMemory: NpcAiCombatMemory;
}

export type Task = (input: TaskInput) => Task;

export interface ObservedCombat {
  actor1: ActorId;
  actor2: ActorId;
}
