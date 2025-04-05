import { SyncClient } from "@mp/sync/client";
import {
  createContext,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  untrack,
  useContext,
} from "solid-js";
import { vecEquals, type Vector } from "@mp/math";
import { dedupe, throttle, type Tile } from "@mp/std";
import { createMutable } from "solid-js/store";
import { AuthContext } from "@mp/auth/client";
import { useTRPC } from "./trpc";
import { type CharacterId } from "@mp-modules/game";
import type { ActorId, Character, GameState } from "@mp-modules/game";

export function createGameStateClient(wsUrl: string) {
  const trpc = useTRPC();
  const { identity } = useContext(AuthContext);
  const id = createMemo(() => identity()?.id);
  const sync = new SyncClient<GameState>(wsUrl, () => ({
    token: identity()?.token,
  }));
  const gameState = createMutable<GameState>({ actors: {} });
  const [characterId, setCharacterId] = createSignal<CharacterId | undefined>();
  const character = createMemo(
    () => gameState.actors[characterId()!] as Character,
  );
  const areaId = createMemo(() => character()?.areaId);
  const [readyState, setReadyState] = createSignal(sync.getReadyState());
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
    vecEquals,
  );
  const attack = (targetId: ActorId) =>
    attackMutation.mutateAsync({ characterId: characterId()!, targetId });

  const respawn = () => respawnMutation.mutateAsync(characterId()!);

  onCleanup(sync.subscribeToState((applyPatch) => applyPatch(gameState)));
  onCleanup(sync.subscribeToReadyState(setReadyState));

  createEffect(() => {
    if (id() !== undefined) {
      untrack(() => sync.start());
      onCleanup(sync.stop);
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
