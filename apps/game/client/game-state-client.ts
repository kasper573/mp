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
import type { GameState } from "../server/game-state";
import type { Character, CharacterId } from "../server/character/schema";
import type { ActorId } from "../server";
import { useRPC } from "./useRPC";

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
    const patch = syncPatchEncoding.decode(e.data);
    if (patch) {
      applyPatch(gameState, patch);
    }
  };

  socket.addEventListener("message", handleMessage);
  onCleanup(() => socket.removeEventListener("message", handleMessage));
  onCleanup(subscribeToReadyState(socket, setReadyState));

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
  const state = useContext(GameStateClientContext);

  const rpc = useRPC();
  const moveMutation = rpc.character.move.createMutation();
  const joinMutation = rpc.character.join.createMutation();
  const attackMutation = rpc.character.attack.createMutation();
  const respawnMutation = rpc.character.respawn.createMutation();

  const move = dedupe(
    throttle(
      (to: Vector<Tile>) =>
        moveMutation.mutate({ characterId: state.characterId()!, to }),
      100,
    ),
    (a, b) => a.equals(b),
  );
  const attack = (targetId: ActorId) =>
    attackMutation.mutate({ characterId: state.characterId()!, targetId });

  const respawn = () => respawnMutation.mutate(state.characterId()!);

  const join = () => joinMutation.mutateAsync().then(state.setCharacterId);

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
