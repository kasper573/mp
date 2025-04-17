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
import { applyPatch, syncPatchEncoding } from "@mp/sync";
import { subscribeToReadyState } from "@mp/ws/client";
import type { AuthToken } from "@mp/auth";
import type { GameState } from "../server/game-state";
import type { Character, CharacterId } from "../server/character/schema";
import type { ActorId } from "../server";
import { useRpc } from "./use-rpc";

export function createGameStateClient(socket: WebSocket) {
  const gameState = createMutable<GameState>({ actors: {} });
  const [characterId, setCharacterId] = createSignal<CharacterId | undefined>();
  const character = createMemo(
    () => gameState.actors[characterId()!] as Character | undefined,
  );
  const [readyState, setReadyState] = createSignal(socket.readyState);
  const areaId = createMemo(() => character()?.areaId);
  const actors = createMemo(() => Object.values(gameState.actors));
  const actorsInArea = createMemo(() =>
    actors().filter((actor) => actor.areaId === areaId()),
  );

  const handleMessage = (e: MessageEvent<ArrayBuffer>) => {
    const result = syncPatchEncoding.decode(e.data);
    if (result.isOk()) {
      applyPatch(gameState, result.value);
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
    actorsInArea,
    gameState,
    readyState,
    setCharacterId,
    areaId,
    characterId,
    character,
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
