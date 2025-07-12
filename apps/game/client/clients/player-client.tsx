import { createEffect } from "solid-js";

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
  const actions = createGameActions(rpc, () => props.stateClient.characterId);

  createEffect(() => {
    const user = auth.identity.get();
    if (props.stateClient.isConnected.get() && user) {
      void actions.join();
    }
  });

  return <GameClient {...props} />;
}
