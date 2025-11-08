import type { DbRepository } from "@mp/db";
import type { SyncGameStateOptions } from "@mp/db";
import { startAsyncInterval, TimeSpan } from "@mp/time";
import type { GameStateServer } from "./game-state-server";

export function gameStateDbSyncBehavior(
  opt: Omit<SyncGameStateOptions, "markToResendFullState"> & {
    db: DbRepository;
    server: GameStateServer;
  },
) {
  return startAsyncInterval(async () => {
    const result = await opt.db.syncGameState({
      ...opt,
      markToResendFullState: (id) => opt.server.markToResendFullState(id),
    });
    if (result.isErr()) {
      opt.logger.error(result.error, "game state db sync save error");
    }
  }, syncInterval);
}

const syncInterval = TimeSpan.fromSeconds(5);
