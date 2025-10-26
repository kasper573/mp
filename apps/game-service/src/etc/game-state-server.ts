import type { CharacterId } from "@mp/game-shared";
import type { GameState } from "@mp/game-shared";
import type { SyncServer } from "@mp/sync";
import type { GameStateEvents } from "./game-state-events";

export type GameStateServer = SyncServer<
  GameState,
  GameStateEvents,
  CharacterId
>;
