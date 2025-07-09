import { createEffect } from "solid-js";
import { useObservable } from "@mp/state/solid";
import { ctxGameRpcClient } from "../game-rpc-client";
import { createGameActions } from "../game-state/game-actions";
import { ioc } from "../context";
import { ctxAuthClient } from "../auth-context";
import type { GameClientProps } from "./game-client";
import { GameClient } from "./game-client";

/**
 * A `GameClient` that joins the game as the authenticated user
 */
export function PlayerClient(props: GameClientProps) {
  const rpc = ioc.get(ctxGameRpcClient);
  const auth = ioc.get(ctxAuthClient);
  const identity = useObservable(auth.identity);
  const actions = createGameActions(rpc, () => props.stateClient.characterId);
  const isOpen = useObservable(() => props.stateClient.isConnected);

  createEffect(() => {
    const user = identity();
    if (isOpen() && user) {
      void actions.join();
    }
  });

  return <GameClient {...props} />;
}
