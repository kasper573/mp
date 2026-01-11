import type { DbRepository } from "@mp/db";
import type { SyncGameStateOptions } from "@mp/db";
import { startAsyncInterval, TimeSpan } from "@mp/time";
import type { GameStateServer } from "./game-state-server";
import type { CharacterId } from "@mp/game-shared";
import type { Result } from "@mp/std";

export type StartDbSyncSession = Omit<
  SyncGameStateOptions,
  "markToResendFullState"
> & {
  db: DbRepository;
  server: GameStateServer;
};

/**
 * Starts a database synchronization session that periodically syncs the game state to and from the database.
 */
export function startDbSyncSession({
  db,
  server,
  ...baseOpt
}: StartDbSyncSession): DbSyncSession {
  const opt: SyncGameStateOptions = {
    ...baseOpt,
    markToResendFullState: (id) => server.markToResendFullState(id),
  };

  const session = startAsyncInterval(async () => {
    const result = await db.gameStateFor(opt).sync();
    if (result.isErr()) {
      opt.logger.error(result.error, "game state db sync save error");
    }
  }, syncInterval);

  return {
    stop: () => session.stop(),
    async save(characterId) {
      const res = await db.gameStateFor(opt).saveOne(characterId);
      if (res.isErr()) {
        opt.logger.error(res.error, "game state db sync save error");
      }
      return res;
    },
    async load(characterId) {
      const res = await db.gameStateFor(opt).loadOne(characterId);
      if (res.isErr()) {
        opt.logger.error(res.error, "game state db sync save error");
      }
      return res;
    },
  };
}

export interface DbSyncSession {
  stop(): void;
  /**
   * Forcefully saves the game state for the given character immediately.
   * Returns a promise that resolves with the result of the save operation.
   */
  save(characterId: CharacterId): Promise<Result<void, unknown>>;
  /**
   * Forcefully loads the game state for the given character immediately.
   * Returns a promise that resolves with the result of the load operation.
   */
  load(characterId: CharacterId): Promise<Result<void, unknown>>;
}

const syncInterval = TimeSpan.fromSeconds(5);
