import { createFileRoute } from "@tanstack/react-router";
import { GameStateClient, PlayerClient } from "@mp/game/client";
import { useContext, useEffect, useMemo } from "preact/hooks";
import { LoadingSpinner } from "@mp/ui";
import { Suspense } from "preact/compat";
import { SocketContext } from "../../integrations/rpc";
import { AuthBoundary } from "../../ui/auth-boundary";
import { MiscDebugUi } from "../../ui/misc-debug-ui";
import { miscDebugSettings } from "../../signals/misc-debug-ui-settings";

export const Route = createFileRoute("/_layout/play")({
  component: AuthBoundary.wrap(PlayPage),
});

function PlayPage() {
  const socket = useContext(SocketContext);
  const stateClient = useMemo(
    () => new GameStateClient({ socket, settings: miscDebugSettings.value }),
    [socket],
  );

  useEffect(() => stateClient.start(), [stateClient]);

  // It's important to have a suspense boundary here to avoid game resources suspending
  // all the way up to the routers pending component, which would unmount the page,
  // which in turn would stop the game client.
  return (
    <Suspense fallback={<LoadingSpinner debugId="PlayPage" />}>
      <PlayerClient
        stateClient={stateClient}
        additionalDebugUi={<MiscDebugUi />}
        interactive
      />
    </Suspense>
  );
}
