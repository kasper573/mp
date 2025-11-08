import type { DbRepository } from "@mp/db";
import type { SyncGameStateOptions } from "@mp/db";
import { startAsyncInterval, TimeSpan } from "@mp/time";
import type { GameStateServer } from "./game-state-server";
import type { Character } from "@mp/game-shared";

/**
 * Starts a database synchronization session that periodically syncs the game state to and from the database.
 */
export function startDbSyncSession(
  opt: Omit<SyncGameStateOptions, "markToResendFullState"> & {
    db: DbRepository;
    server: GameStateServer;
  },
): DbSyncSession {
  const session = startAsyncInterval(async () => {
    const result = await opt.db.syncGameState({
      ...opt,
      markToResendFullState: (id) => opt.server.markToResendFullState(id),
    });
    if (result.isErr()) {
      opt.logger.error(result.error, "game state db sync save error");
    }
  }, syncInterval);

  return {
    stop() {
      session.stop();
    },
    flush() {
      // NOTE the character param is currently unused,
      // but exists for future proofing where we may want to optimize what to flush.
      void session.flush();
    },
  };
}

export interface DbSyncSession {
  stop(): void;
  /**
   * Forcefully flushes any pending sync operations to the database.
   * @param character Only flush data related to this character. If omitted, flushes all pending data.
   */
  flush(character?: Character): void;
}

const syncInterval = TimeSpan.fromSeconds(5);
