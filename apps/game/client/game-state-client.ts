import {
  createContext,
  createMemo,
  createSignal,
  onCleanup,
  useContext,
} from "solid-js";
import type { Vector } from "@mp/math";
import { assert, dedupe, throttle, type Tile } from "@mp/std";
import { createMutable } from "solid-js/store";
import { applyPatch, syncMessageEncoding } from "@mp/sync";
import { subscribeToReadyState } from "@mp/ws/client";
import type { AuthToken } from "@mp/auth";
import { TimeSpan } from "@mp/time";
import type { Logger } from "@mp/logger";
import type { GameState } from "../server/game-state";
import type { Character, CharacterId } from "../server/character/schema";
import type { ActorId } from "../server";
import { useRpc } from "./use-rpc";
import { createSynchronizedActors } from "./area/synchronized-actors";

const stalePatchThreshold = TimeSpan.fromSeconds(1.5);

export function createGameStateClient(socket: WebSocket, logger: Logger) {
  const gameState = createMutable<GameState>({ actors: {} });
  const [characterId, setCharacterId] = createSignal<CharacterId | undefined>();

  const [readyState, setReadyState] = createSignal(socket.readyState);
  const areaId = createMemo(() => {
    const id = characterId();
    const actor = id ? gameState.actors[id] : undefined;
    return actor?.areaId;
  });

  const actors = createSynchronizedActors(
    () => Object.keys(gameState.actors) as ActorId[],
    (id) => gameState.actors[id],
  );

  const character = createMemo(() => {
    const id = characterId();
    const actor = id ? actors.get(id) : undefined;
    return actor ? (actor as Character) : undefined;
  });

  const handleMessage = (e: MessageEvent<ArrayBuffer>) => {
    const result = syncMessageEncoding.decode(e.data);
    if (result.isOk()) {
      const [patch, remoteTime] = result.value;

      const lag = TimeSpan.fromDateDiff(remoteTime, new Date());
      if (lag.compareTo(stalePatchThreshold) > 0) {
        logger.warn(
          `Stale patch detected, requesting full state refresh (lag: ${lag.totalMilliseconds}ms)`,
        );
        refreshState();
      }

      applyPatch(gameState, patch);
    }
  };

  const rpc = useRpc();

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
    actorList: actors.list,
    setCharacterId,
    areaId,
    characterId,
    character,
    frameCallback: actors.frameCallback,
  };
}

export function useGameActions() {
  const rpc = useRpc();
  const state = useContext(GameStateClientContext);

  const move = dedupe(
    throttle(
      (to: Vector<Tile>) =>
        rpc.character.move({ characterId: assert(state.characterId()), to }),
      100,
    ),
    (a, b) => a.equals(b),
  );

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

export const GameStateClientContext = createContext<GameStateClient>(
  new Proxy({} as GameStateClient, {
    get() {
      throw new Error("GameStateClientContext not provided");
    },
  }),
);

export type GameStateClient = ReturnType<typeof createGameStateClient>;
