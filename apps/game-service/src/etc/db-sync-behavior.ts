import type { DbRepository, SyncGameStateSession } from "@mp/db";
import type { SyncGameStateOptions } from "@mp/db";
import { startAsyncInterval, TimeSpan } from "@mp/time";
import type { GameStateServer } from "./game-state-server";
import type { Character } from "@mp/game-shared";

/**
 * Starts a database synchronization session.
 *
 * If Electric URL is configured, this creates a persistent sync session with real-time updates.
 * Otherwise, it uses the traditional polling approach for backwards compatibility.
 */
export async function startDbSyncSession(
  opt: Omit<SyncGameStateOptions, "markToResendFullState"> & {
    db: DbRepository;
    server: GameStateServer;
  },
): Promise<DbSyncSession> {
  let electricSession: SyncGameStateSession | null = null;
  let pollingSession: ReturnType<typeof startAsyncInterval> | null = null;

  // Try to initialize with Electric sync
  const initResult = await opt.db.syncGameState({
    ...opt,
    markToResendFullState: (id) => opt.server.markToResendFullState(id),
  });

  // Check if we got a session (Electric) or a one-shot result (polling)
  initResult.match(
    (result) => {
      // Check if result has save and stop methods (Electric session)
      if (
        typeof result === "object" &&
        result !== null &&
        "save" in result &&
        "stop" in result
      ) {
        electricSession = result as SyncGameStateSession;
        opt.logger.info("Using Electric real-time sync");
      } else {
        // Polling mode - start interval
        pollingSession = startAsyncInterval(async () => {
          const syncResult = await opt.db.syncGameState({
            ...opt,
            markToResendFullState: (id) => opt.server.markToResendFullState(id),
          });
          if (syncResult.isErr()) {
            opt.logger.error(syncResult.error, "game state db sync error");
          }
        }, syncInterval);
        opt.logger.info("Using polling-based sync");
      }
    },
    (error) => {
      opt.logger.error(error, "Failed to initialize sync");
      // Fall back to polling
      pollingSession = startAsyncInterval(async () => {
        const syncResult = await opt.db.syncGameState({
          ...opt,
          markToResendFullState: (id) => opt.server.markToResendFullState(id),
        });
        if (syncResult.isErr()) {
          opt.logger.error(syncResult.error, "game state db sync error");
        }
      }, syncInterval);
      opt.logger.info("Fell back to polling-based sync");
    },
  );

  return {
    stop() {
      if (electricSession) {
        electricSession.stop();
      }
      if (pollingSession) {
        pollingSession.stop();
      }
    },
    flush(_character?: Character) {
      if (electricSession) {
        // Electric session - call save
        void electricSession.save();
      } else if (pollingSession) {
        // Polling session - flush the interval
        void pollingSession.flush();
      }
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
