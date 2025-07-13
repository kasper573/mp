import { InjectionContext } from "@mp/ioc";
import type { SyncServer } from "@mp/sync";
import type { GameStateEvents } from "./game-state-events";
import type { GameState } from "./game-state";

export type GameStateServer = SyncServer<GameState, GameStateEvents>;

export const ctxGameStateServer =
  InjectionContext.new<GameStateServer>("GameStateServer");
