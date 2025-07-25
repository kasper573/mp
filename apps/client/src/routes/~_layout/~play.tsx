import { createFileRoute } from "@tanstack/react-router";
import { GameAssetLoaderContext, PlayerClient } from "@mp/game/client";
import { LoadingSpinner } from "@mp/ui";
import { Suspense } from "preact/compat";
import { AuthBoundary } from "../../ui/auth-boundary";
import { MiscDebugUi } from "../../ui/misc-debug-ui";
import { useGameAssets } from "../../integrations/assets";
import { useGameStateClient } from "../../integrations/game-state-client";

export const Route = createFileRoute("/_layout/play")({
  component: AuthBoundary.wrap(PlayPage),
});

function PlayPage() {
  const [stateClient, events] = useGameStateClient();

  // It's important to have a suspense boundary here to avoid game resources suspending
  // all the way up to the routers pending component, which would unmount the page,
  // which in turn would stop the game client.
  return (
    <Suspense fallback={<LoadingSpinner debugId="PlayPage" />}>
      <GameAssetLoaderContext.Provider value={useGameAssets}>
        <PlayerClient
          stateClient={stateClient}
          additionalDebugUi={<MiscDebugUi />}
          interactive
          sendJoinRequest={() => events.gateway.join()}
        />
      </GameAssetLoaderContext.Provider>
    </Suspense>
  );
}
