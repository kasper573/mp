import { createFileRoute } from "@tanstack/solid-router";
import { GameDebugUiPortal, PlayerClient } from "@mp/game/client";
import { Suspense, useContext } from "solid-js";
import { LoadingSpinner } from "@mp/ui";
import { createGameStateClient } from "@mp/game/client";
import { SocketContext, useRpc } from "../../integrations/rpc";
import { AuthBoundary } from "../../ui/auth-boundary";
import { LoggerContext } from "../../logger";
import { MiscDebugUi } from "../../ui/misc-debug-ui";
import { miscDebugSettings } from "../../signals/misc-debug-ui-settings";

export const Route = createFileRoute("/_layout/play")({
  component: AuthBoundary.wrap(PlayPage),
});

function PlayPage() {
  const gameState = createGameStateClient(
    useRpc(),
    useContext(SocketContext),
    useContext(LoggerContext),
    miscDebugSettings,
  );

  // It's important to have a suspense boundary here to avoid game resources suspending
  // all the way up to the routers pending component, which would unmount the page,
  // which in turn would stop the game client.
  return (
    <Suspense fallback={<LoadingSpinner debugId="PlayPage" />}>
      <PlayerClient gameState={gameState} style={{ display: "flex", flex: 1 }}>
        <GameDebugUiPortal>
          <MiscDebugUi />
        </GameDebugUiPortal>
      </PlayerClient>
    </Suspense>
  );
}
