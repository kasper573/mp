import type { Character, WorldState } from "@mp/server";
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
import type { AuthClient } from "@mp/auth/client";
import type { AreaId } from "@mp/data";
import { vec_equals, type Vector } from "@mp/math";
import { env } from "../env";
import { dedupe, throttle } from "../state/functionComposition";
import { trpc } from "./trpc";

export function createGameClient(authClient: AuthClient): GameClient {
  const syncClient = new SyncClient<WorldState>({
    initialState: { characters: {} },
    url: env.wsUrl,
  });

  const [worldState, setWorldState] = createSignal(syncClient.getState());
  const [characterId, setCharacterId] = createSignal<CharacterId | undefined>();

  const character = createMemo(() => worldState()?.characters[characterId()!]);

  const areaId = createMemo(() => character()?.areaId);

  createEffect(() => {
    syncClient.start();
    onCleanup(() => syncClient.stop());
  });

  createEffect(() => onCleanup(syncClient.subscribe(setWorldState)));

  createEffect(() => {
    const { token } = authClient.state();
    if (token) {
      syncClient.authenticate(token);
    }
  });

  const join = () => trpc.world.join.mutate().then(setCharacterId);

  const serverTick = createMemo(() => worldState()?.serverTick ?? 0);

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
    serverTick,
    areaId,
    characterId,
    character,
    join,
    move,
  };
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
  serverTick: Accessor<number>;
  areaId: Accessor<AreaId | undefined>;
  characterId: Accessor<CharacterId | undefined>;
  character: Accessor<Character | undefined>;
  join(): Promise<unknown>;
  move(pos: Vector): void;
}
