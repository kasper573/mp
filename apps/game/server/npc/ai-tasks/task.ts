import type { TickEvent } from "@mp/time";
import type { Rng } from "@mp/std";
import type { AreaLookup } from "../../area/lookup";
import type { NpcInstance } from "../types";
import type { ActorId } from "../../actor";
import type { NpcAiCombatMemory } from "../npc-ai-combat-memory";
import type { GameState } from "../../game-state";
import type { GameStateEmitter } from "../../game-state-emitter";

export interface TaskInput {
  gameState: GameState;
  gameStateEmitter: GameStateEmitter;
  areas: AreaLookup;
  npc: NpcInstance;
  npcCombatMemories: ReadonlyMap<ActorId, NpcAiCombatMemory>;
  tick: TickEvent;
  rng: Rng;
}

export type Task = (input: TaskInput) => Task;

export interface ObservedCombat {
  actor1: ActorId;
  actor2: ActorId;
}
