import { InjectionContext } from "@mp/ioc";
import type { SyncServer } from "@mp/sync";
import type { GameStateEvents } from "./game-state-events";
import type { GameState } from "./game-state";
import type { CharacterId } from "../character/types";

export type GameStateServer = SyncServer<
  GameState,
  GameStateEvents,
  CharacterId
>;

export const ctxGameStateServer =
  InjectionContext.new<GameStateServer>("GameStateServer");
