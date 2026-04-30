import type { CharacterId } from "@mp/world";
import type { Logger } from "@mp/logger";
import { ResultAsync } from "@mp/std";

// Legacy stub — old SyncMap-based persistence. The new PersistenceModule
// in @mp/db replaces this. Kept only so legacy game-service compiles
// during the rift migration; runtime use throws.

export interface GameStateSyncOptions {
  areaId: unknown;
  state: unknown;
  actorModels: unknown;
  logger: Logger;
  markToResendFullState: (characterId: CharacterId) => void;
  getOnlineCharacterIds: () => CharacterId[];
}

export class GameStateSync {
  readonly #opts: GameStateSyncOptions;

  constructor(_drizzle: unknown, opts: GameStateSyncOptions) {
    this.#opts = opts;
  }

  #notImplemented(): ResultAsync<void, Error> {
    void this.#opts;
    return ResultAsync.fromPromise(
      Promise.reject(
        new Error(
          "GameStateSync removed; use PersistenceModule from @mp/db instead",
        ),
      ),
      (e) => e as Error,
    );
  }
  sync = (): ResultAsync<void, Error> => this.#notImplemented();
  saveOne = (_id: CharacterId): ResultAsync<void, Error> =>
    this.#notImplemented();
  loadOne = (_id: CharacterId): ResultAsync<void, Error> =>
    this.#notImplemented();
  save = (_id: CharacterId): ResultAsync<void, Error> => this.#notImplemented();
  load = (): ResultAsync<void, Error> => this.#notImplemented();
}
