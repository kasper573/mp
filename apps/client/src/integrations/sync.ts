import type { WorldState } from "@mp/server";
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
import { dedupe, throttle } from "../state/functionComposition";
import { env } from "../env";
import { useTRPC } from "./trpc";

export function createSyncClient(auth: AuthClient) {
  const trpc = useTRPC();
  const id = createMemo(() => auth.identity()?.id);
  const sync = new SyncClient<WorldState>(env.wsUrl, () => ({
    token: auth.identity()?.token,
  }));
  const [worldState, setWorldState] = createSignal<WorldState>();
  const [characterId, setCharacterId] = createSignal<CharacterId | undefined>();
  const character = createMemo(() => worldState()?.characters[characterId()!]);
  const areaId = createMemo(() => character()?.areaId);
  const [readyState, setReadyState] = createSignal(sync.getReadyState());
  const actorsInArea = createMemo(() =>
    [
      ...Object.values(worldState()?.characters ?? []),
      ...Object.values(worldState()?.npcs ?? []),
    ].filter((char) => char.areaId === areaId()),
  );

  const moveMutation = trpc.character.move.use(() => ({
    meta: { invalidateCache: false },
  }));
  const { mutate: join } = trpc.character.join.use(() => ({
    onSuccess: setCharacterId,
  }));

  const move = dedupe(
    throttle(
      // eslint-disable-next-line solid/reactivity
      (to: Vector<Tile>) =>
        moveMutation.mutate({ characterId: characterId()!, to }),
      100,
    ),
    vec_equals,
  );

  onCleanup(sync.subscribeToState(setWorldState));
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
