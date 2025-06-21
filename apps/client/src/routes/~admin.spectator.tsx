import { createFileRoute } from "@tanstack/solid-router";
import {
  createGameStateClient,
  GameDebugUiPortal,
  SpectatorClient,
  useRpc,
  worldRoles,
} from "@mp/game/client";
import { Suspense, useContext } from "solid-js";
import { LoadingSpinner } from "@mp/ui";
import { AuthBoundary } from "../ui/auth-boundary";
import { SocketContext } from "../integrations/rpc";
import { LoggerContext } from "../logger";
import { MiscDebugUi } from "../ui/misc-debug-ui";
import { miscDebugSettings } from "../signals/misc-debug-ui-settings";

export const Route = createFileRoute("/admin/spectator")({
  component: AuthBoundary.wrap(RouteComponent, {
    requiredRoles: [worldRoles.spectate],
  }),
});

function RouteComponent() {
  const gameState = createGameStateClient(
    useRpc(),
    useContext(SocketContext),
    useContext(LoggerContext),
    miscDebugSettings,
  );

  return (
    <div style={{ padding: "32px" }}>
      <Suspense fallback={<LoadingSpinner debugId="admin.spectator" />}>
        <SpectatorClient gameState={gameState}>
          <GameDebugUiPortal>
            <MiscDebugUi />
          </GameDebugUiPortal>
        </SpectatorClient>
      </Suspense>
    </div>
  );
}
