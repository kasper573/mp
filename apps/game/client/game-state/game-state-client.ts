import { throttle } from "@mp/std";
import { SyncEventBus, syncMessageEncoding } from "@mp/sync";
import { subscribeToReadyState } from "@mp/ws/client";
import { TimeSpan } from "@mp/time";
import type { Logger } from "@mp/logger";
import type { Atom } from "@mp/state";
import { atom } from "@mp/state";
import type { CharacterId } from "../../server/character/types";
import type { GameStateEvents } from "../../server/game-state-events";
import type { GameSolidRpcInvoker } from "../use-rpc";
import type { OptimisticGameStateSettings } from "./optimistic-game-state";
import { OptimisticGameState } from "./optimistic-game-state";

const stalePatchThreshold = TimeSpan.fromSeconds(1.5);

export interface GameStateClientOptions {
  rpc: GameSolidRpcInvoker;
  socket: WebSocket;
  logger: Logger;
  settings: () => OptimisticGameStateSettings;
}

export class GameStateClient {
  readonly eventBus = new SyncEventBus<GameStateEvents>();
  readonly gameState: OptimisticGameState;
  readonly characterId = atom<CharacterId | undefined>(undefined);
  readonly readyState: Atom<WebSocket["readyState"]>;

  constructor(public options: GameStateClientOptions) {
    this.gameState = new OptimisticGameState(() => this.options.settings());
    this.readyState = atom<WebSocket["readyState"]>(
      this.options.socket.readyState,
    );

    // We throttle because when stale patches are detected, they usually come in batches,
    // and we only want to send one request for full state.
    this.refreshState = throttle(this.options.rpc.world.requestFullState, 5000);
  }

  private refreshState: () => unknown;

  start = () => {
    const { socket } = this.options;

    const unsubscribeFromReadyState = subscribeToReadyState(
      socket,
      (newReadyState) => this.readyState.set(newReadyState),
    );

    socket.addEventListener("message", this.handleMessage);

    this.stop = () => {
      unsubscribeFromReadyState();
      socket.removeEventListener("message", this.handleMessage);

      const id = this.characterId.get();
      if (id !== undefined) {
        void this.options.rpc.world.leave(id);
      }
    };

    // Return stop function so that start can be used in effect like manner.
    return this.stop;
  };

  stop = () => {
    // Does nothing by default, stop function will be overridden by start function.
  };

  private handleMessage = (e: MessageEvent<ArrayBuffer>) => {
    const result = syncMessageEncoding.decode(e.data);
    if (result.isOk()) {
      const [patch, remoteTime, events] = result.value;

      const lag = TimeSpan.fromDateDiff(remoteTime, new Date());
      if (lag.compareTo(stalePatchThreshold) > 0) {
        this.options.logger.warn(
          `Stale patch detected, requesting full state refresh (lag: ${lag.totalMilliseconds}ms)`,
        );
        this.refreshState();
      }

      if (patch) {
        this.gameState.applyPatch(patch, (desiredEventName) => {
          return (events ?? [])
            .filter(([eventName]) => eventName === desiredEventName)
            .map(([, payload]) => payload as never);
        });
      }

      if (events) {
        for (const event of events) {
          this.eventBus.dispatch(event);
        }
      }
    }
  };
}
