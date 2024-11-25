import type {
  Character,
  SyncServerConnectionMetaData,
  WorldState,
} from "@mp/server";
import { type CharacterId } from "@mp/server";
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
import type { AuthClient } from "@mp/auth/client";
import { env } from "../env";
import { dedupe, throttle } from "../state/functionComposition";
import { trpc } from "./trpc";

export function createGameClient(authClient: AuthClient): GameClient {
  const worldState = createWorldStateSignal(authClient);
  const [characterId, setCharacterId] = createSignal<CharacterId | undefined>();
  const character = createMemo(() => worldState()?.characters[characterId()!]);
  const areaId = createMemo(() => character()?.areaId);

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

  return {
    worldState,
    areaId,
    characterId,
    character,
    join,
    move,
  };
}

function createWorldStateSignal(authClient: AuthClient) {
  const [worldState, setWorldState] = createSignal<WorldState>();
  const syncClient = createMemo(() => {
    const user = authClient.user();
    if (!user) {
      return;
    }

    return new SyncClient<WorldState, SyncServerConnectionMetaData>(
      env.wsUrl,
      () => ({ token: user.token }),
    );
  });

  createEffect(() => {
    const client = syncClient();
    if (client) {
      client.start();
      onCleanup(() => client.stop());
    }
  });

  createEffect(() => {
    const client = syncClient();
    if (client) {
      onCleanup(client.subscribe(setWorldState));
    }
  });

  return worldState;
}

export const GameClientContext = createContext<GameClient>(
  new Proxy({} as GameClient, {
    get() {
      throw new Error("GameClientContext not provided");
    },
  }),
);

export interface GameClient {
  worldState: Accessor<WorldState | undefined>;
  areaId: Accessor<AreaId | undefined>;
  characterId: Accessor<CharacterId | undefined>;
  character: Accessor<Character | undefined>;
  join(): Promise<unknown>;
  move(pos: Vector): void;
}
