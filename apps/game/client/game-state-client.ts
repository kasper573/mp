import type { Accessor } from "solid-js";
import { createContext, createSignal, onCleanup, useContext } from "solid-js";
import type { Vector } from "@mp/math";
import { assert, throttle, type Tile } from "@mp/std";
import { SyncEventBus, syncMessageEncoding } from "@mp/sync";
import { subscribeToReadyState } from "@mp/ws/client";
import type { AuthToken } from "@mp/auth";
import { TimeSpan } from "@mp/time";
import type { Logger } from "@mp/logger";
import type { ObjectId } from "@mp/tiled-loader";
import type { Character, CharacterId } from "../server/character/types";
import type { ActorId } from "../server";
import type { GameStateEvents } from "../server/game-state-events";
import type { GameSolidRpcInvoker } from "./use-rpc";
import { useRpc } from "./use-rpc";
import type { OptimisticGameStateSettings } from "./create-optimistic-game-state";
import { createOptimisticGameState } from "./create-optimistic-game-state";

const stalePatchThreshold = TimeSpan.fromSeconds(1.5);

export function createGameStateClient(
  rpc: GameSolidRpcInvoker,
  socket: WebSocket,
  logger: Logger,
  settings: Accessor<OptimisticGameStateSettings>,
) {
  const eventBus = new SyncEventBus<GameStateEvents>();
  const gameState = createOptimisticGameState(settings);
  const [characterId, setCharacterId] = createSignal<CharacterId | undefined>();
  const [readyState, setReadyState] = createSignal(socket.readyState);

  const areaId = () => {
    const id = characterId();
    const actor = id ? gameState().actors[id] : undefined;
    return actor?.areaId;
  };

  const character = () => {
    const id = characterId();
    const actor = id ? gameState().actors[id] : undefined;
    return actor ? (actor as Character) : undefined;
  };

  const actorList = () => Object.values(gameState().actors);

  const handleMessage = (e: MessageEvent<ArrayBuffer>) => {
    const result = syncMessageEncoding.decode(e.data);
    if (result.isOk()) {
      const [patch, remoteTime, events] = result.value;

      const lag = TimeSpan.fromDateDiff(remoteTime, new Date());
      if (lag.compareTo(stalePatchThreshold) > 0) {
        logger.warn(
          `Stale patch detected, requesting full state refresh (lag: ${lag.totalMilliseconds}ms)`,
        );
        refreshState();
      }

      if (patch) {
        gameState.applyPatch(patch, (desiredEventName) => {
          return (events ?? [])
            .filter(([eventName]) => eventName === desiredEventName)
            .map(([, payload]) => payload as never);
        });
      }

      if (events) {
        for (const event of events) {
          eventBus.dispatch(event);
        }
      }
    }
  };

  // We throttle because when stale patches are detected, they usually come in batches,
  // and we only want to send one request for full state.
  const refreshState = throttle(rpc.world.requestFullState, 5000);

  socket.addEventListener("message", handleMessage);
  onCleanup(() => socket.removeEventListener("message", handleMessage));
  onCleanup(subscribeToReadyState(socket, setReadyState));
  onCleanup(() => {
    const id = characterId();
    if (id !== undefined) {
      void rpc.world.leave(id);
    }
  });

  return {
    readyState,
    actorList,
    setCharacterId,
    areaId,
    characterId,
    character,
    frameCallback: gameState.frameCallback,
    eventBus,
    get: () => gameState(),
  };
}

export function createGameActions(
  rpc: GameSolidRpcInvoker,
  state: GameStateClient,
) {
  const move = (to: Vector<Tile>, desiredPortalId?: ObjectId) => {
    return rpc.character.move({
      characterId: assert(state.characterId()),
      to,
      desiredPortalId,
    });
  };

  const attack = (targetId: ActorId) =>
    rpc.character.attack({
      characterId: assert(state.characterId()),
      targetId,
    });

  const respawn = () => rpc.character.respawn(assert(state.characterId()));

  const join = (token: AuthToken) =>
    rpc.world.join(token).then(state.setCharacterId);

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
  return createGameActions(rpc, state);
}

export const GameStateClientContext = createContext<GameStateClient>(
  new Proxy({} as GameStateClient, {
    get() {
      throw new Error("GameStateClientContext not provided");
    },
  }),
);

export type GameStateClient = ReturnType<typeof createGameStateClient>;
