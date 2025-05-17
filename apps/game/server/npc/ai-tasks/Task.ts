import type { ReadonlyDeep } from "@mp/sync";
import type { TickEvent } from "@mp/time";
import type { AreaLookup } from "../../area/lookup";
import type { GameStateMachine } from "../../game-state";
import type { NpcInstance } from "../schema";

export interface TaskInput {
  gameState: GameStateMachine;
  areas: AreaLookup;
  npc: ReadonlyDeep<NpcInstance>;
  tick: TickEvent;
}

export type Task = (input: TaskInput) => Task;
