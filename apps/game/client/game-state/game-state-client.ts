import { throttle } from "@mp/std";
import { SyncEventBus, syncMessageEncoding } from "@mp/sync";
import { subscribeToReadyState } from "@mp/ws/client";
import { TimeSpan } from "@mp/time";
import type { Signal, ReadonlySignal } from "@mp/state";
import { computed, signal } from "@mp/state";
import { InjectionContext } from "@mp/ioc";
import type { Character, CharacterId } from "../../server/character/types";
import type { GameStateEvents } from "../../server/game-state-events";
import { ctxGameRpcClient } from "../game-rpc-client";
import type { Actor } from "../../server/actor";
import type { AreaId } from "../../server";
import { ioc } from "../context/ioc";
import { ctxLogger } from "../context/common";
import type { OptimisticGameStateSettings } from "./optimistic-game-state";
import { OptimisticGameState } from "./optimistic-game-state";
import { GameActions } from "./game-actions";

const stalePatchThreshold = TimeSpan.fromSeconds(1.5);

export interface GameStateClientOptions {
  socket: WebSocket;
  settings: OptimisticGameStateSettings;
}

export class GameStateClient {
  readonly eventBus = new SyncEventBus<GameStateEvents>();
  readonly actions: GameActions;

  private rpc = ioc.get(ctxGameRpcClient);
  private logger = ioc.get(ctxLogger);

  // State
  readonly gameState: OptimisticGameState;
  readonly characterId = signal<CharacterId | undefined>(undefined);
  readonly readyState: Signal<WebSocket["readyState"]>;
  readonly isConnected: ReadonlySignal<boolean>;

  // Derived state
  readonly actorList: ReadonlySignal<Actor[]>;
  readonly character: ReadonlySignal<Character | undefined>;
  readonly areaId: ReadonlySignal<AreaId | undefined>;

  constructor(public options: GameStateClientOptions) {
    this.gameState = new OptimisticGameState(this.options.settings);
    this.readyState = signal<WebSocket["readyState"]>(
      this.options.socket.readyState,
    );
    this.isConnected = computed(() => this.readyState.value === WebSocket.OPEN);

    this.actions = new GameActions(this.rpc, this.characterId);

    // We throttle because when stale patches are detected, they usually come in batches,
    // and we only want to send one request for full state.
    this.refreshState = throttle(this.rpc.world.requestFullState, 5000);

    this.actorList = computed(() => this.gameState.actors.values().toArray());

    this.character = computed(() => {
      const char = this.gameState.actors.get(
        this.characterId.value as CharacterId,
      ) as Character | undefined;
      return char;
    });

    this.areaId = computed(() => this.character.value?.areaId);
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

      const id = this.characterId.value;
      if (id !== undefined) {
        void this.rpc.world.leave(id);
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
        this.logger.warn(
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

export const ctxGameStateClient =
  InjectionContext.new<GameStateClient>("GameStateClient");
