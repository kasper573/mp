import { createFileRoute } from "@tanstack/solid-router";
import { GameStateClient, PlayerClient } from "@mp/game/client";
import { onCleanup, Suspense, useContext } from "solid-js";
import { LoadingSpinner } from "@mp/ui";
import { useStorage } from "@mp/state/solid";
import { SocketContext } from "../../integrations/rpc";
import { AuthBoundary } from "../../ui/auth-boundary";
import { LoggerContext } from "../../logger";
import { MiscDebugUi } from "../../ui/misc-debug-ui";
import { miscDebugStorage } from "../../signals/misc-debug-ui-settings";

export const Route = createFileRoute("/_layout/play")({
  component: AuthBoundary.wrap(PlayPage),
});

function PlayPage() {
  const [settings] = useStorage(miscDebugStorage);
  const stateClient = new GameStateClient({
    socket: useContext(SocketContext),
    logger: useContext(LoggerContext),
    settings,
  });

  onCleanup(stateClient.start());

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
