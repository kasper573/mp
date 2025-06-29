import type { Accessor } from "solid-js";
import { createContext, createMemo, useContext } from "solid-js";
import type { Vector } from "@mp/math";
import { assert, throttle, type Tile } from "@mp/std";
import { SyncEventBus, syncMessageEncoding } from "@mp/sync";
import { subscribeToReadyState } from "@mp/ws/client";
import { TimeSpan } from "@mp/time";
import type { Logger } from "@mp/logger";
import type { ObjectId } from "@mp/tiled-loader";
import type { Atom } from "@mp/state";
import { atom } from "@mp/state";
import type { Character, CharacterId } from "../../server/character/types";
import { type ActorId } from "../../server";
import type { GameStateEvents } from "../../server/game-state-events";
import type { GameSolidRpcInvoker } from "../use-rpc";
import { useRpc } from "../use-rpc";
import { useSyncEntity, useSyncMap } from "../use-sync";
import type { OptimisticGameStateSettings } from "./optimistic-game-state";
import { OptimisticGameState } from "./optimistic-game-state";

const stalePatchThreshold = TimeSpan.fromSeconds(1.5);

export interface GameStateClientOptions {
  rpc: GameSolidRpcInvoker;
  socket: WebSocket;
  logger: Logger;
  settings: Accessor<OptimisticGameStateSettings>;
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

export type ReactiveGameState = ReturnType<typeof deriveReactiveGameState>;

export function deriveReactiveGameState(client: Accessor<GameStateClient>) {
  const actors = useSyncMap(() => client().gameState.actors);

  const actorList = () => Array.from(actors().values());

  const character = createMemo(() => {
    const char = actors().get(client().characterId.get() as CharacterId) as
      | Character
      | undefined;
    return char ? useSyncEntity(char) : undefined;
  });

  const areaId = () => character()?.areaId;

  return {
    client,
    actors,
    actorList,
    areaId,
    character,
  };
}

export function createGameActions(
  rpc: GameSolidRpcInvoker,
  characterId: Accessor<Atom<CharacterId | undefined>>,
) {
  const move = (to: Vector<Tile>, desiredPortalId?: ObjectId) => {
    return rpc.character.move({
      characterId: assert(characterId().get()),
      to,
      desiredPortalId,
    });
  };

  const attack = (targetId: ActorId) =>
    rpc.character.attack({
      characterId: assert(characterId().get()),
      targetId,
    });

  const respawn = () => rpc.character.respawn(assert(characterId().get()));

  const join = async () => {
    const char = await rpc.world.join();
    characterId().set(char.id);
    return char;
  };

  return {
    respawn,
    join,
    move,
    attack,
  };
}

export function useGameActions() {
  const rpc = useRpc();
  const state = useContext(GameStateClientContext);
  return createGameActions(rpc, () => state().characterId);
}

export const ReactiveGameStateContext = createContext<
  Accessor<ReactiveGameState>
>(
  new Proxy({} as Accessor<ReactiveGameState>, {
    get() {
      throw new Error("ReactiveGameStateContext not provided");
    },
  }),
);

export const GameStateClientContext = createContext<Accessor<GameStateClient>>(
  new Proxy({} as Accessor<GameStateClient>, {
    get() {
      throw new Error("GameStateClientContext not provided");
    },
  }),
);
