import { graphql, useQueryBuilder } from "@mp/api-service/client";
import { GameAssetLoaderContext, GameClient } from "@mp/game-client";
import { useSignalEffect } from "@mp/state/react";
import { LoadingSpinner } from "@mp/ui";
import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "preact/compat";
import { gameAssetLoader } from "../../integrations/assets";
import { useGameStateClient } from "../../integrations/use-game-state-client";
import { AuthBoundary } from "../../ui/auth-boundary";
import { MiscDebugUi } from "../../ui/misc-debug-ui";
import { toResult } from "@mp/std";

export const Route = createFileRoute("/_layout/play")({
  component: AuthBoundary.wrap(PlayPage),
});

function PlayPage() {
  const [stateClient, events] = useGameStateClient();
  const { client } = useQueryBuilder();

  useSignalEffect(() => {
    // Important to subscribe to connected state to rejoin the gateway in case of a disconnect
    if (stateClient.isConnected.value) {
      // Temporary solution until we have a proper character selection UI
      void client.query({ query }).then((obj) => {
        const { myCharacterId } = toResult(obj)._unsafeUnwrap();
        stateClient.characterId.value = myCharacterId;
        events.gateway.join(myCharacterId);
      });
    }
  });

  // It's important to have a suspense boundary here to avoid game resources suspending
  // all the way up to the routers pending component, which would unmount the page,
  // which in turn would stop the game client.
  return (
    <Suspense fallback={<LoadingSpinner debugId="PlayPage" />}>
      <GameAssetLoaderContext.Provider value={gameAssetLoader}>
        <GameClient
          stateClient={stateClient}
          additionalDebugUi={<MiscDebugUi />}
          interactive
        />
      </GameAssetLoaderContext.Provider>
    </Suspense>
  );
}

const query = graphql(`
  query PlayPage {
    myCharacterId
  }
`);
