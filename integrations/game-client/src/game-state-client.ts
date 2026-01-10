import type { CharacterId } from "@mp/game-shared";
import type { GameEventClient, GameStateEvents } from "@mp/game-service";
import type { Actor, Character, ItemInstance } from "@mp/game-shared";
import {
  registerEncoderExtensions,
  syncMessageEncoding,
} from "@mp/game-shared";
import type { Logger } from "@mp/logger";
import type { ReadonlySignal, Signal } from "@mp/state";
import { computed, signal } from "@mp/state";
import { throttle } from "@mp/std";
import { SyncEventBus } from "@mp/sync";
import { TimeSpan } from "@mp/time";
import { subscribeToReadyState } from "@mp/ws/client";
import { GameActions } from "./game-actions";
import type { OptimisticGameStateSettings } from "./optimistic-game-state";
import { OptimisticGameState } from "./optimistic-game-state";

registerEncoderExtensions();

const stalePatchThreshold = TimeSpan.fromSeconds(1.5);

export interface GameStateClientOptions {
  socket: WebSocketLike;
  settings: () => OptimisticGameStateSettings;
  eventClient: GameEventClient;
  logger: Logger;
  handlePatchFailure?: (error: Error) => void;
}

export class GameStateClient {
  readonly eventBus = new SyncEventBus<GameStateEvents>();
  readonly actions: GameActions;

  // State
  readonly gameState: OptimisticGameState;
  readonly characterId = signal<CharacterId | undefined>(undefined);
  readonly areaId = computed(
    () => this.gameState.globals.get("instance")?.areaId,
  );
  readonly socketReadyState: Signal<WebSocket["readyState"]>;

  /**
   * Is true while connected to the gateway.
   */
  readonly isConnected: ReadonlySignal<boolean>;

  /**
   * Is true while connected to the gateway and a game service
   * has claimed the character this client is controlling.
   */
  readonly isGameReady = computed(() => !!this.areaId.value);

  // Derived state
  readonly actorList: ReadonlySignal<readonly Actor[]>;
  readonly character: ReadonlySignal<Character | undefined>;
  readonly inventory: ReadonlySignal<readonly ItemInstance[]>;

  constructor(public options: GameStateClientOptions) {
    this.gameState = new OptimisticGameState(this.options.settings);
    this.socketReadyState = signal<WebSocket["readyState"]>(
      this.options.socket.readyState,
    );
    this.isConnected = computed(
      () => this.socketReadyState.value === WebSocket.OPEN,
    );

    this.actions = new GameActions(this.options.eventClient, this.characterId);

    this.actorList = computed(() => this.gameState.actors.values().toArray());

    this.character = computed(() => {
      const char = this.gameState.actors.get(
        this.characterId.value as CharacterId,
      ) as Character | undefined;
      return char;
    });

    this.inventory = computed(() => {
      const inventoryId = this.character.value?.inventoryId;
      if (inventoryId === undefined) {
        return [];
      }
      return this.gameState.items
        .values()
        .filter((item) => item.inventoryId === inventoryId)
        .toArray();
    });
  }

  start = () => {
    const { socket } = this.options;

    const subscriptions = [
      subscribeToReadyState(socket, (readyState) => {
        this.socketReadyState.value = readyState;
      }),
      this.isConnected.subscribe((isConnected) => {
        if (!isConnected) {
          this.options.logger.debug(
            `Disconnected from gateway, resetting game state.`,
          );
          this.gameState.reset();
        }
      }),
    ];

    socket.addEventListener("message", this.handleMessage);

    this.stop = () => {
      for (const unsubscribe of subscriptions) {
        unsubscribe();
      }

      socket.removeEventListener("message", this.handleMessage);
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
        this.onPatchLagOrError(lag);
      }

      if (patch) {
        const result = this.gameState.applyPatch(patch, (desiredEventName) => {
          return (events ?? [])
            .filter(([eventName]) => eventName === desiredEventName)
            .map(([, payload]) => payload as never);
        });

        if (result.isErr()) {
          const { handlePatchFailure } = this.options;
          if (handlePatchFailure) {
            handlePatchFailure(result.error);
          } else {
            this.onPatchLagOrError(result.error);
          }
        }
      }

      if (events) {
        for (const event of events) {
          this.eventBus.dispatch(event);
        }
      }
    }
  };

  // We throttle because when stale patches or errors are detected as they usually come in batches.
  private onPatchLagOrError = throttle((lagOrError: TimeSpan | Error) => {
    const { logger, eventClient } = this.options;
    if (lagOrError instanceof TimeSpan) {
      logger.warn(
        `Stale patch detected (lag: ${lagOrError.totalMilliseconds}ms). Requesting full state refresh.`,
      );
    } else {
      logger.error(
        lagOrError,
        "Could not apply patch. Requesting full state refresh.",
      );
    }

    eventClient.network.requestFullState();
  }, 5000);
}

type WebSocketLike = Pick<
  WebSocket,
  "send" | "readyState" | "addEventListener" | "removeEventListener"
>;
