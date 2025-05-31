import { InjectionContext } from "@mp/ioc";
import type { SyncEmitter } from "@mp/sync";
import type { GameStateEvents } from "./game-state-events";
import type { GameState } from "./game-state";

export type GameStateEmitter = SyncEmitter<GameState, GameStateEvents>;

export const ctxGameStateEmitter =
  InjectionContext.new<GameStateEmitter>("GameStateEmitter");
