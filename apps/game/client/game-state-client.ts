import {
  createContext,
  createMemo,
  createSignal,
  onCleanup,
  useContext,
} from "solid-js";
import type { Vector } from "@mp/math";
import { dedupe, throttle, type Tile } from "@mp/std";
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
  const areaId = createMemo(() => gameState.actors[characterId()!]?.areaId);

  const actors = createSynchronizedActors();

  const actorList = createMemo(() => Object.values(actors.record));

  const character = createMemo(
    () => actors.record[characterId()!] as Character | undefined,
  );

  const handleMessage = (e: MessageEvent<ArrayBuffer>) => {
    const result = syncMessageEncoding.decode(e.data);
    if (result.isOk()) {
      const [patch, remoteTime] = result.value;

      const lag = TimeSpan.fromDateDiff(remoteTime, new Date());
      if (lag.compareTo(stalePatchThreshold) > 0) {
        logger.warn(`Stale patch detected (lag: ${lag.totalMilliseconds}ms)`);
      }

      applyPatch(gameState, patch);
      actors.receiveRemoteUpdate(gameState.actors);
    }
  };

  const rpc = useRpc();
  socket.addEventListener("message", handleMessage);
  onCleanup(() => socket.removeEventListener("message", handleMessage));
  onCleanup(subscribeToReadyState(socket, setReadyState));
  onCleanup(() => {
    const id = characterId();
    if (id !== undefined) {
      void rpc.character.leave(id);
    }
  });

  return {
    readyState,
    actorRecord: actors.record,
    actorList,
    setCharacterId,
    areaId,
    characterId,
    character,
    frameCallback: actors.advanceLocalUpdate,
  };
}

export function useGameActions() {
  const rpc = useRpc();
  const state = useContext(GameStateClientContext);

  const move = dedupe(
    throttle(
      (to: Vector<Tile>) =>
        rpc.character.move({ characterId: state.characterId()!, to }),
      100,
    ),
    (a, b) => a.equals(b),
  );

  const attack = (targetId: ActorId) =>
    rpc.character.attack({ characterId: state.characterId()!, targetId });

  const respawn = () => rpc.character.respawn(state.characterId()!);

  const join = (token: AuthToken) =>
    rpc.character.join(token).then(state.setCharacterId);

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
