import { throttle } from "@mp/std";
import { SyncEventBus, syncMessageEncoding } from "@mp/sync";
import { subscribeToReadyState } from "@mp/ws/client";
import { TimeSpan } from "@mp/time";
import type { Signal, ReadonlySignal } from "@mp/state";
import { computed, signal } from "@mp/state";
import { InjectionContext } from "@mp/ioc";
import type { GameStateEvents } from "./game-state-events";
import type { Actor } from "../actor/actor";
import type { OptimisticGameStateSettings } from "./optimistic-game-state";
import { OptimisticGameState } from "./optimistic-game-state";
import { GameActions } from "./game-actions";
import type { Character, CharacterId } from "../character/types";

import type { Logger } from "@mp/logger";
import { ioc } from "../context/ioc";
import { ctxLogger } from "../context/common";
import type { GameEventClient } from "../network/game-event-client";
import { ctxGameEventClient } from "../network/game-event-client";

const stalePatchThreshold = TimeSpan.fromSeconds(1.5);

export interface GameStateClientOptions {
  socket: WebSocketLike;
  settings: () => OptimisticGameStateSettings;
  eventClient?: GameEventClient;
  logger?: Logger;
}

export class GameStateClient {
  readonly eventBus = new SyncEventBus<GameStateEvents>();
  readonly actions: GameActions;

  private events: GameEventClient;
  private logger: Logger;

  // State
  readonly gameState: OptimisticGameState;
  readonly characterId = signal<CharacterId | undefined>(undefined);
  readonly areaId = computed(() => this.gameState.area.get("current")?.id);
  readonly readyState: Signal<WebSocket["readyState"]>;
  readonly isConnected: ReadonlySignal<boolean>;

  // Derived state
  readonly actorList: ReadonlySignal<Actor[]>;
  readonly character: ReadonlySignal<Character | undefined>;

  constructor(public options: GameStateClientOptions) {
    this.gameState = new OptimisticGameState(this.options.settings);
    this.readyState = signal<WebSocket["readyState"]>(
      this.options.socket.readyState,
    );
    this.isConnected = computed(() => this.readyState.value === WebSocket.OPEN);
    this.events = this.options.eventClient ?? ioc.get(ctxGameEventClient);
    this.logger = this.options.logger ?? ioc.get(ctxLogger);

    this.actions = new GameActions(this.events, this.characterId);

    // We throttle because when stale patches are detected, they usually come in batches,
    // and we only want to send one request for full state.
    this.refreshState = throttle(this.events.network.requestFullState, 5000);

    this.actorList = computed(() => this.gameState.actors.values().toArray());

    this.character = computed(() => {
      const char = this.gameState.actors.get(
        this.characterId.value as CharacterId,
      ) as Character | undefined;
      return char;
    });
  }

  private refreshState: () => unknown;

  start = () => {
    const { socket } = this.options;

    const subscriptions = [
      subscribeToReadyState(socket, (readyState) => {
        this.readyState.value = readyState;
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
        this.logger.warn(
          `Stale patch detected, requesting full state refresh (lag: ${lag.totalMilliseconds}ms)`,
        );
        this.refreshState();
      }

      try {
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
      } catch (error) {
        this.logger.error(error, `Error applying patch`);
      }
    }
  };
}

type WebSocketLike = Pick<
  WebSocket,
  "send" | "readyState" | "addEventListener" | "removeEventListener"
>;

export const ctxGameStateClient =
  InjectionContext.new<GameStateClient>("GameStateClient");
