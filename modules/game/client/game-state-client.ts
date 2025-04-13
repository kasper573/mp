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
import { useTRPC } from "./trpc";
import { type CharacterId } from "@mp-modules/game";
import type { ActorId, Character, GameState } from "@mp-modules/game";

export function createGameStateClient(
  wsUrlForToken: (token?: string) => string,
) {
  const auth = useContext(AuthContext);
  const id = createMemo(() => auth.identity()?.id);

  const socket = new EnhancedWebSocket();
  const gameState = createMutable<GameState>({ actors: {} });
  const [characterId, setCharacterId] = createSignal<CharacterId | undefined>();
  const character = createMemo(
    () => gameState.actors[characterId()!] as Character,
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
    if (id() !== undefined) {
      const url = wsUrlForToken(auth.identity()?.token);
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

  const trpc = useTRPC();
  const moveMutation = trpc.character.move.createMutation(config);
  const joinMutation = trpc.character.join.createMutation(config);
  const attackMutation = trpc.character.attack.createMutation(config);
  const respawnMutation = trpc.character.respawn.createMutation(config);

  const move = dedupe(
    throttle(
      (to: Vector<Tile>) =>
        moveMutation.mutateAsync({ characterId: state.characterId()!, to }),
      100,
    ),
    (a, b) => a.equals(b),
  );
  const attack = (targetId: ActorId) =>
    attackMutation.mutateAsync({ characterId: state.characterId()!, targetId });

  const respawn = () => respawnMutation.mutateAsync(state.characterId()!);

  const join = () => joinMutation.mutateAsync().then(state.setCharacterId);

  return {
    respawn,
    join,
    move,
    attack,
  };
}

const config = () => ({ meta: { invalidateCache: false } });

export const GameStateClientContext = createContext<GameStateClient>(
  new Proxy({} as GameStateClient, {
    get() {
      throw new Error("GameStateClientContext not provided");
    },
  }),
);

export type GameStateClient = ReturnType<typeof createGameStateClient>;
