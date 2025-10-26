import { syncGameState, type SyncGameStateOptions } from "@mp/db";
import { startAsyncInterval, TimeSpan } from "@mp/time";
import type { GameStateServer } from "./game-state-server";

export function gameStateDbSyncBehavior(
  opt: Omit<SyncGameStateOptions, "markToResendFullState"> & {
    server: GameStateServer;
  },
) {
  return startAsyncInterval(async () => {
    try {
      await syncGameState({
        ...opt,
        markToResendFullState: (id) => opt.server.markToResendFullState(id),
      });
    } catch (e) {
      opt.logger.error(e, "game state db sync save error");
    }
  }, syncInterval);
}

const syncInterval = TimeSpan.fromSeconds(5);
