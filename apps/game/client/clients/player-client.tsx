import { createEffect, useContext } from "solid-js";
import { AuthContext } from "@mp/auth/client";
import { ctxGameRpcClient } from "../game-rpc-client";
import { createGameActions } from "../game-state/game-actions";
import { ioc } from "../context";
import type { GameClientProps } from "./game-client";
import { GameClient } from "./game-client";

export function PlayerClient(props: GameClientProps) {
  const rpc = ioc.get(ctxGameRpcClient);
  const auth = useContext(AuthContext);
  const actions = createGameActions(rpc, () => props.gameState.characterId);

  createEffect(() => {
    const user = auth.identity();
    if (props.gameState.readyState.get() === WebSocket.OPEN && user) {
      void actions.join();
    }
  });

  return <GameClient {...props} />;
}
