import { createFileRoute } from "@tanstack/react-router";
import { GameStateClient, SpectatorClient, worldRoles } from "@mp/game";
import { useContext, useEffect, useMemo } from "preact/hooks";
import { LoadingSpinner } from "@mp/ui";
import { Suspense } from "preact/compat";
import { AuthBoundary } from "../../../ui/auth-boundary";
import { SocketContext } from "../../../integrations/rpc";
import { MiscDebugUi } from "../../../ui/misc-debug-ui";
import { miscDebugSettings } from "../../../signals/misc-debug-ui-settings";

export const Route = createFileRoute("/_layout/admin/spectator")({
  component: AuthBoundary.wrap(RouteComponent, {
    requiredRoles: [worldRoles.spectate],
  }),
});

function RouteComponent() {
  const socket = useContext(SocketContext);
  const stateClient = useMemo(
    () =>
      new GameStateClient({ socket, settings: () => miscDebugSettings.value }),
    [socket],
  );

  useEffect(() => stateClient.start(), [stateClient]);

  return (
    <div
      style={{
        padding: "32px",
        display: "flex",
        flexDirection: "column",
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
