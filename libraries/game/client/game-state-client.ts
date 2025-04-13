import {
  createContext,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  untrack,
  useContext,
} from "solid-js";
import type { Vector } from "@mp/math";
import { dedupe, throttle, type Tile } from "@mp/std";
import { createMutable } from "solid-js/store";
import { AuthContext } from "@mp/auth/client";
import { EnhancedWebSocket } from "@mp/ws/client";
import { isSyncMessage, parseSyncMessage } from "@mp/sync/client";
import { useRPC } from "../rpc.slice";
import { type CharacterId } from "@mp/game";
import type { ActorId, Character, GameState } from "@mp/game";

export function createGameStateClient(
  wsUrlForToken: (token: string) => string,
) {
  const socket = new EnhancedWebSocket();
  const auth = useContext(AuthContext);
  const getToken = createMemo(() => auth.identity()?.token);
  const gameState = createMutable<GameState>({ actors: {} });
  const [characterId, setCharacterId] = createSignal<CharacterId | undefined>();
  const character = createMemo(
    () => gameState.actors[characterId()!] as Character | undefined,
  );
  const areaId = createMemo(() => character()?.areaId);
  const [readyState, setReadyState] = createSignal(socket.getReadyState());
  const actors = createMemo(() => Object.values(gameState.actors));
  const actorsInArea = createMemo(() =>
    actors().filter((actor) => actor.areaId === areaId()),
  );

  onCleanup(
    socket.subscribeToMessage((message) => {
      if (isSyncMessage(message)) {
        const applyPatch = parseSyncMessage(message);
        applyPatch(gameState);
      }
    }),
  );

  onCleanup(socket.subscribeToReadyState(setReadyState));

  createEffect(() => {
    const token = getToken();
    if (token !== undefined) {
      const url = wsUrlForToken(token);
      untrack(() => socket.start(url));
      onCleanup(socket.stop);
    }
  });

  return {
    actorsInArea,
    readyState,
    gameState,
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
