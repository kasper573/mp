import { graphql, useQueryBuilder } from "@mp/api-service/client";
import { GameAssetLoaderContext, GameClient } from "@mp/game-client";
import { LoadingSpinner } from "@mp/ui";
import { createFileRoute } from "@tanstack/solid-router";
import { Suspense, createEffect } from "solid-js";
import { gameAssetLoader } from "../../integrations/assets";
import { useGameStateClient } from "../../integrations/use-game-state-client";
import { AuthBoundary } from "../../ui/auth-boundary";
import { MiscDebugUi } from "../../ui/misc-debug-ui";
import { createQuery } from "@tanstack/solid-query";

export const Route = createFileRoute("/_layout/play")({
  component: AuthBoundary.wrap(PlayPage),
});

function PlayPage() {
  const [stateClient, events] = useGameStateClient();
  const qb = useQueryBuilder();
  const query = createQuery(() => qb.queryOptions(characterQuery));

  // Auto joining as default character is a temporary solution until we have a proper character selection UI
  createEffect(() => {
    const myCharacterId = query.data?.myCharacterId;
    // Important to read isConnected to retrigger join when connection is re-established
    const isConnected = stateClient.isConnected.get();

    if (!myCharacterId) {
      if (stateClient.characterId.get()) {
        events.gateway.leave();
      }
      stateClient.characterId.write(undefined);
    } else if (isConnected) {
      stateClient.characterId.write(myCharacterId);
      events.gateway.join(myCharacterId);
    }
  });

  // It's important to have a suspense boundary here to avoid game resources suspending
  // all the way up to the routers pending component, which would unmount the page,
  // which in turn would stop the game client.
  return (
    <Suspense fallback={<LoadingSpinner debugDescription="~play.tsx" />}>
      <GameAssetLoaderContext.Provider value={gameAssetLoader}>
        <GameClient
          stateClient={stateClient}
          additionalDebugUi={<MiscDebugUi stateClient={stateClient} />}
          interactive
        />
      </GameAssetLoaderContext.Provider>
    </Suspense>
  );
}

const characterQuery = graphql(`
  query PlayPage {
    myCharacterId
  }
`);
