import { useSignalEffect } from "@mp/state/react";

import { ioc } from "../context/ioc";
import { ctxAuthClient } from "../context/common";
import type { GameClientProps } from "./game-client";
import { GameClient } from "./game-client";

export interface PlayerClientProps extends GameClientProps {
  sendJoinRequest(): void;
}

/**
 * A `GameClient` that joins the game as the authenticated user
 */
export function PlayerClient(props: PlayerClientProps) {
  const auth = ioc.get(ctxAuthClient);

  useSignalEffect(() => {
    if (props.stateClient.isConnected.value && auth.identity.value) {
      props.sendJoinRequest();
    }
  });

  return <GameClient {...props} />;
}
