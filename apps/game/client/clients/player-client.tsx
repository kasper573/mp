import { createEffect, useContext } from "solid-js";
import { AuthContext } from "@mp/auth/client";
import { useRpc } from "../use-rpc";
import { createGameActions } from "../game-state/game-actions";
import type { GameClientProps } from "./game-client";
import { GameClient } from "./game-client";

export function PlayerClient(props: GameClientProps) {
  const rpc = useRpc();
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
