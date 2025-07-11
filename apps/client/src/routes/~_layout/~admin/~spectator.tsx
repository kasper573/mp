import { createFileRoute } from "@tanstack/solid-router";
import { GameStateClient, SpectatorClient, worldRoles } from "@mp/game/client";
import { onCleanup, Suspense, useContext } from "solid-js";
import { LoadingSpinner } from "@mp/ui";
import { useStorage } from "@mp/state/solid";
import { AuthBoundary } from "../../../ui/auth-boundary";
import { SocketContext } from "../../../integrations/rpc";
import { LoggerContext } from "../../../logger";
import { MiscDebugUi } from "../../../ui/misc-debug-ui";
import { miscDebugStorage } from "../../../signals/misc-debug-ui-settings";

export const Route = createFileRoute("/_layout/admin/spectator")({
  component: AuthBoundary.wrap(RouteComponent, {
    requiredRoles: [worldRoles.spectate],
  }),
});

function RouteComponent() {
  const [settings] = useStorage(miscDebugStorage);
  const stateClient = new GameStateClient({
    socket: useContext(SocketContext),
    logger: useContext(LoggerContext),
    settings,
  });

  onCleanup(stateClient.start());

  return (
    <div
      style={{
        padding: "32px",
        display: "flex",
        "flex-direction": "column",
        flex: 1,
      }}
    >
      <Suspense fallback={<LoadingSpinner debugId="admin.spectator" />}>
        <SpectatorClient
          stateClient={stateClient}
          additionalDebugUi={<MiscDebugUi />}
          interactive={false}
        />
      </Suspense>
    </div>
  );
}
