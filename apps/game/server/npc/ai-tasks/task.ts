import type { ReadonlyDeep } from "@mp/sync";
import type { TickEvent } from "@mp/time";
import type { Rng } from "@mp/std";
import type { AreaLookup } from "../../area/lookup";
import type { GameStateMachine } from "../../game-state";
import type { NpcInstance } from "../types";
import type { ActorId } from "../../traits/actor";
import type { NpcAiCombatMemory } from "../npc-ai-combat-memory";

export interface TaskInput {
  gameState: GameStateMachine;
  areas: AreaLookup;
  npc: ReadonlyDeep<NpcInstance>;
  npcCombatMemories: ReadonlyMap<ActorId, NpcAiCombatMemory>;
  tick: TickEvent;
  rng: Rng;
}

export type Task = (input: TaskInput) => Task;

export interface ObservedCombat {
  actor1: ActorId;
  actor2: ActorId;
}
