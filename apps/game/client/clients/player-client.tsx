import { useSignalEffect } from "@mp/state/react";
import { ctxGameRpcClient } from "../game-rpc-client";
import { GameActions } from "../game-state/game-actions";
import { ioc } from "../context/ioc";
import { ctxAuthClient } from "../context/common";
import type { GameClientProps } from "./game-client";
import { GameClient } from "./game-client";

/**
 * A `GameClient` that joins the game as the authenticated user
 */
export function PlayerClient(props: GameClientProps) {
  const rpc = ioc.get(ctxGameRpcClient);
  const auth = ioc.get(ctxAuthClient);

  useSignalEffect(() => {
    if (props.stateClient.isConnected.value && auth.identity.value) {
      const actions = new GameActions(rpc, props.stateClient.characterId);
      void actions.join();
    }
  });

  return <GameClient {...props} />;
}
