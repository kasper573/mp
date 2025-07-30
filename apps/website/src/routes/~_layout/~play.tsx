import { useApiClient } from "@mp/api-service/sdk";
import { GameAssetLoaderContext, GameClient } from "@mp/game/client";
import { useSignalEffect } from "@mp/state/react";
import { LoadingSpinner } from "@mp/ui";
import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "preact/compat";
import { useGameAssets } from "../../integrations/assets";
import { useGameStateClient } from "../../integrations/game-state-client";
import { AuthBoundary } from "../../ui/auth-boundary";
import { MiscDebugUi } from "../../ui/misc-debug-ui";

export const Route = createFileRoute("/_layout/play")({
  component: AuthBoundary.wrap(PlayPage),
});

function PlayPage() {
  const [stateClient, events] = useGameStateClient();
  const api = useApiClient();

  useSignalEffect(() => {
    // Important to subscribe to connected state to rejoin the gateway in case of a disconnect
    if (stateClient.isConnected.value) {
      // Temporary solution until we have a proper character selection UI
      void api.myCharacterId.query().then((id) => {
        stateClient.characterId.value = id;
        events.gateway.join(id);
      });
    }
  });

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
