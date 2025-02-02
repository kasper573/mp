import type { Character, NPCInstance, WorldState } from "@mp/server";
import { type CharacterId } from "@mp/server";
import { SyncClient } from "@mp/sync/client";
import {
  createContext,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  untrack,
} from "solid-js";
import { vec_equals, type Vector } from "@mp/math";
import type { AuthClient } from "@mp/auth/client";
import type { Tile } from "@mp/std";
import { createMutable } from "solid-js/store";
import { dedupe, throttle } from "../state/functionComposition";
import { env } from "../env";
import { useTRPC } from "./trpc";

export function createSyncClient(auth: AuthClient) {
  const trpc = useTRPC();
  const id = createMemo(() => auth.identity()?.id);
  const sync = new SyncClient<WorldState>(env.wsUrl, () => ({
    token: auth.identity()?.token,
  }));
  const worldState = createMutable<WorldState>({ characters: {}, npcs: {} });
  const [characterId, setCharacterId] = createSignal<CharacterId | undefined>();
  const character = createMemo(
    () => worldState.characters[characterId()!] as Character | undefined,
  );
  const areaId = createMemo(() => character()?.areaId);
  const [readyState, setReadyState] = createSignal(sync.getReadyState());
  const actors = createMemo(
    (): Array<Character | NPCInstance> =>
      Object.values({
        ...worldState.characters,
        ...worldState.npcs,
      }),
  );
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
