import type { CharacterId } from "@mp/db/types";
import type { GameState } from "@mp/game-shared";
import { InjectionContext } from "@mp/ioc";
import type { SyncServer } from "@mp/sync";
import type { GameStateEvents } from "./game-state-events";

export type GameStateServer = SyncServer<
  GameState,
  GameStateEvents,
  CharacterId
>;

export const ctxGameStateServer =
  InjectionContext.new<GameStateServer>("GameStateServer");
