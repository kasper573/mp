import { createFileRoute } from "@tanstack/react-router";
import { GameAssetLoaderContext, GameClient } from "@mp/game/client";
import { LoadingSpinner } from "@mp/ui";
import { Suspense, useEffect } from "preact/compat";
import { AuthBoundary } from "../../ui/auth-boundary";
import { MiscDebugUi } from "../../ui/misc-debug-ui";
import { useGameAssets } from "../../integrations/assets";
import { useGameStateClient } from "../../integrations/game-state-client";
import { useApiClient } from "@mp/api/sdk";

export const Route = createFileRoute("/_layout/play")({
  component: AuthBoundary.wrap(PlayPage),
});

function PlayPage() {
  const [stateClient, events] = useGameStateClient();
  const api = useApiClient();

  useEffect(() => {
    // Temporary solution until we have a proper character selection UI
    void api.myCharacterId.query().then((id) => {
      events.gateway.join(id);
    });
  }, [events, api]);

  // It's important to have a suspense boundary here to avoid game resources suspending
  // all the way up to the routers pending component, which would unmount the page,
  // which in turn would stop the game client.
  return (
    <Suspense fallback={<LoadingSpinner debugId="PlayPage" />}>
      <GameAssetLoaderContext.Provider value={useGameAssets}>
        <GameClient
          stateClient={stateClient}
          additionalDebugUi={<MiscDebugUi />}
          interactive
        />
      </GameAssetLoaderContext.Provider>
    </Suspense>
  );
}
