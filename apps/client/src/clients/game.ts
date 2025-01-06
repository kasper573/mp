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
} from "solid-js";
import type { AreaId } from "@mp/data";
import { vec_equals, type Vector } from "@mp/math";
import type { AuthClient } from "@mp/auth-client";
import { dedupe, throttle } from "../state/functionComposition";
import { env } from "../env";
import { trpc } from "./trpc";

export function createGameClient(sync: WorldStateSyncClient): GameClient {
  const [worldState, setWorldState] = createSignal<WorldState>();
  const [characterId, setCharacterId] = createSignal<CharacterId | undefined>();
  const character = createMemo(() => worldState()?.characters[characterId()!]);
  const areaId = createMemo(() => character()?.areaId);
  const [readyState, setReadyState] = createSignal(sync.getReadyState());

  const join = async () => trpc.world.join.mutate().then(setCharacterId);

  const move = dedupe(
    throttle(
      // eslint-disable-next-line solid/reactivity
      ({ x, y }: Vector) =>
        trpc.world.move.mutate({ characterId: characterId()!, x, y }),
      100,
    ),
    vec_equals,
  );

  onCleanup(sync.subscribeToState(setWorldState));
  onCleanup(sync.subscribeToReadyState(setReadyState));

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

export function createSyncClient(authClient: AuthClient) {
  const token = createMemo(() => authClient.identity()?.token);
  const connectionMetaData = () => ({ token: token() });

  const sync: WorldStateSyncClient = new SyncClient(
    env.wsUrl,
    connectionMetaData,
  );

  createEffect(() => {
    if (token()) {
      sync.start();
      onCleanup(sync.stop);
    }
  });

  return sync;
}

export type WorldStateSyncClient = SyncClient<WorldState>;

export const GameClientContext = createContext<GameClient>(
  new Proxy({} as GameClient, {
    get() {
      throw new Error("GameClientContext not provided");
    },
  }),
);

export interface GameClient {
  readyState: Accessor<SyncClientReadyState>;
  worldState: Accessor<WorldState | undefined>;
  areaId: Accessor<AreaId | undefined>;
  characterId: Accessor<CharacterId | undefined>;
  character: Accessor<Character | undefined>;
  join(): Promise<unknown>;
  move(pos: Vector): void;
}
