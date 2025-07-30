import type {
  ActorId,
  AreaResource,
  GameState,
  NpcInstance,
} from "@mp/game-shared";
import type { Rng } from "@mp/std";
import type { TickEvent } from "@mp/time";
import type { GameStateServer } from "../../game-state/game-state-server";
import type { NpcAiCombatMemory } from "../npc-ai-combat-memory";

export interface NpcAiTaskContext {
  gameState: GameState;
  gameStateServer: GameStateServer;
  area: AreaResource;
  npcCombatMemories: ReadonlyMap<ActorId, NpcAiCombatMemory>;
  tick: TickEvent;
  rng: Rng;
}

export type Task = (context: NpcAiTaskContext, npc: NpcInstance) => Task;

export interface ObservedCombat {
  actor1: ActorId;
  actor2: ActorId;
}
