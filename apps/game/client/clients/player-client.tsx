import type { ParentProps } from "solid-js";
import { createEffect, useContext } from "solid-js";
import { AuthContext } from "@mp/auth/client";
import { useRpc } from "../use-rpc";
import { createGameActions, type GameStateClient } from "../game-state-client";
import { Game } from "./game-client";

export function PlayerClient(
  props: ParentProps<{ gameState: GameStateClient }>,
) {
  const rpc = useRpc();
  const auth = useContext(AuthContext);
  const actions = createGameActions(rpc, () => props.gameState);

  createEffect(() => {
    const user = auth.identity();
    if (props.gameState.readyState() === WebSocket.OPEN && user) {
      void actions.join();
    }
  });

  return <Game gameState={props.gameState}>{props.children}</Game>;
}
