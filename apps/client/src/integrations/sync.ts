import type { Character, WorldState } from "@mp/server";
import { type CharacterId } from "@mp/server";
import type { SyncClientReadyState } from "@mp/sync/client";
import { SyncClient } from "@mp/sync/client";
import type { Accessor } from "solid-js";
import {
  createContext,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  untrack,
} from "solid-js";
import type { AreaId } from "@mp/data";
import { vec_equals, type Vector } from "@mp/math";
import type { AuthClient } from "@mp/auth-client";
import { dedupe, throttle } from "../state/functionComposition";
import { env } from "../env";
import { trpc } from "./trpc";

export function createSyncClient(auth: AuthClient): WorldSyncClient {
  const id = createMemo(() => auth.identity()?.id);
  const sync = new SyncClient<WorldState>(env.wsUrl, () => ({
    token: auth.identity()?.token,
  }));
  const [worldState, setWorldState] = createSignal<WorldState>();
  const [characterId, setCharacterId] = createSignal<CharacterId | undefined>();
  const character = createMemo(() => worldState()?.characters[characterId()!]);
  const areaId = createMemo(() => character()?.areaId);
  const [readyState, setReadyState] = createSignal(sync.getReadyState());

  const join = async () => trpc.world.join.mutate().then(setCharacterId);

  const move = dedupe(
    throttle(
      // eslint-disable-next-line solid/reactivity
      (to: Vector) =>
        trpc.world.move.mutate({ characterId: characterId()!, to }),
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

export interface WorldSyncClient {
  readyState: Accessor<SyncClientReadyState>;
  worldState: Accessor<WorldState | undefined>;
  areaId: Accessor<AreaId | undefined>;
  characterId: Accessor<CharacterId | undefined>;
  character: Accessor<Character | undefined>;
  join(): Promise<unknown>;
  move(pos: Vector): void;
}
