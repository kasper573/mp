import type { TickEvent } from "@mp/time";
import type { Rng } from "@mp/std";
import type { AreaLookup } from "../../area/lookup";
import type { NpcInstance } from "../types";
import type { ActorId } from "../../actor/actor";
import type { NpcAiCombatMemory } from "../npc-ai-combat-memory";
import type { GameState } from "../../game-state/game-state";
import type { GameStateServer } from "../../game-state/game-state-server";

export interface NpcAiTaskContext {
  gameState: GameState;
  gameStateServer: GameStateServer;
  areas: AreaLookup;
  npcCombatMemories: ReadonlyMap<ActorId, NpcAiCombatMemory>;
  tick: TickEvent;
  rng: Rng;
}

export type Task = (context: NpcAiTaskContext, npc: NpcInstance) => Task;

export interface ObservedCombat {
  actor1: ActorId;
  actor2: ActorId;
}
