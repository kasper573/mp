import type { DbRepository } from "@mp/db";
import type { SyncGameStateOptions } from "@mp/db";
import { startAsyncInterval, TimeSpan } from "@mp/time";
import type { GameStateServer } from "./game-state-server";
import type { CharacterId } from "@mp/game-shared";

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
    const result = await db.gameState.for(opt).sync();
    if (result.isErr()) {
      opt.logger.error(result.error, "game state db sync save error");
    }
  }, syncInterval);

  return {
    stop: () => session.stop(),
    save(characterId) {
      db.gameState
        .for({ ...opt, characterId })
        .save()
        .catch((res) => {
          opt.logger.error(res, "game state db sync save error");
        });
    },
    load(characterId) {
      db.gameState
        .for({ ...opt, characterId })
        .load()
        .catch((res) => {
          opt.logger.error(res, "game state db sync load error");
        });
    },
  };
}

export interface DbSyncSession {
  stop(): void;
  /**
   * Forcefully saves the game state for the given character immediately
   */
  save(characterId: CharacterId): void;
  /**
   * Forcefully loads the game state for the given character immediately
   */
  load(characterId: CharacterId): void;
}

const syncInterval = TimeSpan.fromSeconds(5);
