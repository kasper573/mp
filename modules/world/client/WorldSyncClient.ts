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
import { vec_equals, type Vector } from "@mp/math";
import type { Tile } from "@mp/std";
import { createMutable } from "solid-js/store";
import { AuthContext } from "@mp/auth/client";
import { dedupe, throttle } from "./functionComposition";
import { useTRPC } from "./trpc";
import { type CharacterId } from "@mp-modules/world";
import type { ActorId, Character, WorldState } from "@mp-modules/world";

export function createWorldSyncClient(wsUrl: string) {
  const trpc = useTRPC();
  const { identity } = useContext(AuthContext);
  const id = createMemo(() => identity()?.id);
  const sync = new SyncClient<WorldState>(wsUrl, () => ({
    token: identity()?.token,
  }));
  const worldState = createMutable<WorldState>({ actors: {} });
  const [characterId, setCharacterId] = createSignal<CharacterId | undefined>();
  const character = createMemo(
    () => worldState.actors[characterId()!] as Character,
  );
  const areaId = createMemo(() => character()?.areaId);
  const [readyState, setReadyState] = createSignal(sync.getReadyState());
  const actors = createMemo(() => Object.values(worldState.actors));
  const actorsInArea = createMemo(() =>
    actors().filter((actor) => actor.areaId === areaId()),
  );

  const moveMutation = trpc.character.move.createMutation(config);
  const joinMutation = trpc.character.join.createMutation(config);
  const attackMutation = trpc.character.attack.createMutation(config);

  const move = dedupe(
    throttle(
      // eslint-disable-next-line solid/reactivity
      (to: Vector<Tile>) =>
        moveMutation.mutateAsync({ characterId: characterId()!, to }),
      100,
    ),
    vec_equals,
  );
  const attack = (targetId: ActorId) =>
    attackMutation.mutateAsync({ characterId: characterId()!, targetId });

  onCleanup(sync.subscribeToState((applyPatch) => applyPatch(worldState)));
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
    worldState,
    areaId,
    characterId,
    character,
    join,
    move,
    attack,
  };
}

const config = () => ({ meta: { invalidateCache: false } });

export const WorldSyncClientContext = createContext<WorldSyncClient>(
  new Proxy({} as WorldSyncClient, {
    get() {
      throw new Error("WorldClientContext not provided");
    },
  }),
);

export type WorldSyncClient = ReturnType<typeof createWorldSyncClient>;
