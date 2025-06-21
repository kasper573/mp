import { createEffect, useContext } from "solid-js";
import { AuthContext } from "@mp/auth/client";
import { useRpc } from "../use-rpc";
import { createGameActions } from "../game-state-client";
import type { GameClientProps } from "./game-client";
import { GameClient } from "./game-client";

export function PlayerClient(props: GameClientProps) {
  const rpc = useRpc();
  const auth = useContext(AuthContext);
  const actions = createGameActions(rpc, () => props.gameState);

  createEffect(() => {
    const user = auth.identity();
    if (props.gameState.readyState() === WebSocket.OPEN && user) {
      void actions.join();
    }
  });

  return <GameClient {...props} />;
}
