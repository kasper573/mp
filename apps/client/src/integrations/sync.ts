import type { Character, WorldState } from "@mp/server";
import { type CharacterId } from "@mp/server";
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
import { dedupe, throttle } from "../state/functionComposition";
import { env } from "../env";
import { useTRPC } from "./trpc";
import { UserIdentityContext } from "./userIdentity";

export function createSyncClient() {
  const identity = useContext(UserIdentityContext);
  const trpc = useTRPC();
  const id = createMemo(() => identity()?.id);
  const sync = new SyncClient<WorldState>(env.wsUrl, () => ({
    token: identity()?.token,
  }));
  const worldState = createMutable<WorldState>({ actors: {} });
  const [characterId, setCharacterId] = createSignal<CharacterId | undefined>();
  const character = createMemo(
    () => worldState.actors[characterId()!] as Character | undefined,
  );
  const areaId = createMemo(() => character()?.areaId);
  const [readyState, setReadyState] = createSignal(sync.getReadyState());
  const actors = createMemo(() => Object.values(worldState.actors));
  const actorsInArea = createMemo(() =>
    actors().filter((actor) => actor.areaId === areaId()),
  );

  const moveMutation = trpc.character.move.createMutation(() => ({
    meta: { invalidateCache: false },
  }));
  const res = trpc.character.join.createMutation(() => ({
    onSuccess: setCharacterId,
  }));

  const join = res.mutate;

  const move = dedupe(
    throttle(
      // eslint-disable-next-line solid/reactivity
      (to: Vector<Tile>) =>
        moveMutation.mutate({ characterId: characterId()!, to }),
      100,
    ),
    vec_equals,
  );

  onCleanup(sync.subscribeToState((applyPatch) => applyPatch(worldState)));
  onCleanup(sync.subscribeToReadyState(setReadyState));

  createEffect(() => {
    if (id() !== undefined) {
      untrack(() => sync.start());
      onCleanup(sync.stop);
    }
  });

  return {
    actorsInArea,
    readyState,
    worldState,
    areaId,
    characterId,
    character,
    join,
    move,
  };
}

export const SyncClientContext = createContext<WorldSyncClient>(
  new Proxy({} as WorldSyncClient, {
    get() {
      throw new Error("WorldClientContext not provided");
    },
  }),
);

export type WorldSyncClient = ReturnType<typeof createSyncClient>;
