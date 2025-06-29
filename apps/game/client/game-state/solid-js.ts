import type { Accessor } from "solid-js";
import { createContext, createMemo, useContext } from "solid-js";
import type { CharacterId, Character } from "../../server";
import { useRpc } from "../use-rpc";
import { useSyncMap, useSyncEntity } from "../use-sync";
import { createGameActions } from "./game-actions";
import type { GameStateClient } from "./game-state-client";

// This module integrates game state with solid-js

export type ReactiveGameState = ReturnType<typeof deriveReactiveGameState>;

export function deriveReactiveGameState(client: Accessor<GameStateClient>) {
  const actors = useSyncMap(() => client().gameState.actors);

  const actorList = () => Array.from(actors().values());

  const character = createMemo(() => {
    const char = actors().get(client().characterId.get() as CharacterId) as
      | Character
      | undefined;
    return char ? useSyncEntity(char) : undefined;
  });

  const areaId = () => character()?.areaId;

  return {
    client,
    actors,
    actorList,
    areaId,
    character,
  };
}

export function useGameActions() {
  const rpc = useRpc();
  const state = useContext(GameStateClientContext);
  return createGameActions(rpc, () => state().characterId);
}

export const ReactiveGameStateContext = createContext<
  Accessor<ReactiveGameState>
>(
  new Proxy({} as Accessor<ReactiveGameState>, {
    get() {
      throw new Error("ReactiveGameStateContext not provided");
    },
  }),
);

export const GameStateClientContext = createContext<Accessor<GameStateClient>>(
  new Proxy({} as Accessor<GameStateClient>, {
    get() {
      throw new Error("GameStateClientContext not provided");
    },
  }),
);
