import { createFileRoute } from "@tanstack/solid-router";
import {
  createGameStateClient,
  SpectatorClient,
  useRpc,
  worldRoles,
} from "@mp/game/client";
import { Suspense, useContext } from "solid-js";
import { LoadingSpinner } from "@mp/ui";
import { AuthBoundary } from "../ui/auth-boundary";
import { SocketContext } from "../integrations/rpc";
import { LoggerContext } from "../logger";

export const Route = createFileRoute("/admin/spectator")({
  component: AuthBoundary.wrap(RouteComponent, {
    requiredRoles: [worldRoles.spectate],
  }),
});

function RouteComponent() {
  const logger = useContext(LoggerContext);
  const socket = useContext(SocketContext);
  const rpc = useRpc();

  const gameState = createGameStateClient(rpc, socket, logger, () => ({
    useInterpolator: true,
    usePatchOptimizer: true,
    visualizeNetworkFogOfWar: false,
  }));

  return (
    <div style={{ padding: "32px" }}>
      <Suspense fallback={<LoadingSpinner debugId="admin.spectator" />}>
        <SpectatorClient gameState={gameState} />
      </Suspense>
    </div>
  );
}
