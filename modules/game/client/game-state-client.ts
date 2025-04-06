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
import { parsePatchMessage } from "@mp/sync/client";
import { useTRPC } from "./trpc";
import { type CharacterId } from "@mp-modules/game";
import type { ActorId, Character, GameState } from "@mp-modules/game";

export function createGameStateClient(
  wsUrlForToken: (token?: string) => string,
) {
  const trpc = useTRPC();
  const { identity } = useContext(AuthContext);
  const id = createMemo(() => identity()?.id);

  // TODO EnhancedWebSocket must be reactive. It has to be recreated when the token changes.
  const socket = new EnhancedWebSocket(wsUrlForToken(identity()?.token));
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

  // TODO: refactor
  const moveMutation = trpc.character.move.createMutation(config);
  const joinMutation = trpc.character.join.createMutation(config);
  const attackMutation = trpc.character.attack.createMutation(config);
  const respawnMutation = trpc.character.respawn.createMutation(config);

  const move = dedupe(
    throttle(
      // eslint-disable-next-line solid/reactivity
      (to: Vector<Tile>) =>
        moveMutation.mutateAsync({ characterId: characterId()!, to }),
      100,
    ),
    (a, b) => a.equals(b),
  );
  const attack = (targetId: ActorId) =>
    attackMutation.mutateAsync({ characterId: characterId()!, targetId });

  const respawn = () => respawnMutation.mutateAsync(characterId()!);

  onCleanup(
    socket.subscribeToMessage(
      (message) =>
        void parsePatchMessage(message).then((applyPatch) =>
          applyPatch(gameState),
        ),
    ),
  );

  onCleanup(socket.subscribeToReadyState(setReadyState));

  createEffect(() => {
    if (id() !== undefined) {
      untrack(() => socket.start());
      onCleanup(socket.stop);
    }
  });

  const join = () => joinMutation.mutateAsync().then(setCharacterId);

  return {
    actorsInArea,
    readyState,
    gameState,
    respawn,
    areaId,
    characterId,
    character,
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
